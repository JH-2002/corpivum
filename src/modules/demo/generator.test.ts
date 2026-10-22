import { addDays } from '@/lib/dates';
import { buildDashboard } from '@/modules/health/dashboard';
import { createDemoSource } from '@/modules/health/source';
import { DEMO_DAYS, generateDemoData } from './generator';

const TODAY = '2026-10-07';
const TZ = 'America/Sao_Paulo';

describe('dados de demonstração (LEG-X02, §40)', () => {
  const data = generateDemoData(TODAY, TZ);

  it('é determinístico para o mesmo dia', () => {
    expect(generateDemoData(TODAY, TZ)).toEqual(data);
  });

  it('cobre 90 dias até hoje, sem datas futuras', () => {
    const first = addDays(TODAY, -(DEMO_DAYS - 1));
    const days = [
      ...data.sleep.map((r) => r.day),
      ...data.checks.map((r) => r.day),
      ...data.body.map((r) => r.day),
    ];
    expect(Math.min(...days.map((d) => Date.parse(d)))).toBeGreaterThanOrEqual(Date.parse(first));
    expect(days.every((d) => d <= TODAY)).toBe(true);
    expect(data.sleep.length).toBeGreaterThan(70);
    expect(data.body.length).toBeGreaterThanOrEqual(12);
  });

  it('respeita as mesmas faixas do banco', () => {
    for (const r of data.sleep) {
      const h = (Date.parse(r.wakeAt) - Date.parse(r.bedAt)) / 3_600_000;
      expect(h).toBeGreaterThan(0);
      expect(h).toBeLessThanOrEqual(24);
      expect(r.quality).toBeGreaterThanOrEqual(1);
      expect(r.quality).toBeLessThanOrEqual(5);
    }
    for (const r of data.body) {
      if (r.weightKg !== null) expect(r.weightKg).toBeGreaterThan(20);
    }
  });

  it('mede todas as regiões em toda medição e a altura também na mais recente (9c)', () => {
    // As mesmas datas no twin, no início e no Antes × Agora: nenhuma região "sem registro" numa data de medição.
    for (const field of ['chestCm', 'armCm', 'waistCm', 'hipCm', 'thighCm'] as const) {
      for (const r of data.body) expect(r[field], `${field} em ${r.day}`).not.toBeNull();
    }
    expect(data.body.filter((r) => r.day >= addDays(TODAY, -29)).length).toBeGreaterThanOrEqual(4);
    expect(data.body.at(-1)?.heightCm).toBe(170);
    expect(data.body[0]?.heightCm).toBe(170);
  });

  it('não contém dado de contato nem identificador pessoal', () => {
    const text = JSON.stringify(data);
    expect(text).not.toMatch(/@|\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\(\d{2}\)\s?\d{4,5}-\d{4}/);
  });

  it('alimenta um dashboard completo, sem gráfico vazio', async () => {
    const range = { from: addDays(TODAY, -29), to: TODAY };
    const d = await buildDashboard(createDemoSource(data), range, TODAY);
    expect(d.source).toBe('demo');
    expect(d.state).toBe('ok');
    expect(d.score.value).not.toBeNull();
    for (const card of [d.cards.sleep, d.cards.habits, d.cards.body]) {
      expect(card.state).toBe('ok');
      expect(card.spark.some((p) => p.value !== null)).toBe(true);
    }
    expect(d.combined).toHaveLength(30);
    expect(d.todayHabits).toHaveLength(3);
  });

  it.each([7, 30, 90])(
    'Índice e dashboard completos nos últimos %i dias, sem "parcial" (ADR-0050)',
    async (n) => {
      for (const today of [TODAY, '2026-11-15', '2027-02-03']) {
        const demo = generateDemoData(today, TZ);
        const range = { from: addDays(today, -(n - 1)), to: today };
        const d = await buildDashboard(createDemoSource(demo), range, today);
        expect(d.state, today).toBe('ok');
        expect(d.score.partial, today).toBe(false);
        expect(d.score.components.every((c) => c.included)).toBe(true);
      }
    },
  );

  it('período sem dados vira no-data', async () => {
    const src = createDemoSource(data);
    const old = { from: '2020-01-01', to: '2020-01-31' };
    expect((await buildDashboard(src, old, TODAY)).state).toBe('no-data');
  });
});

describe('Índice sem recompensa por pesagem (LEG-M06, revisão M6)', () => {
  it('dias só com medição do corpo não contam na constância de registro', async () => {
    const full = generateDemoData(TODAY, TZ);
    const range = { from: addDays(TODAY, -6), to: TODAY };
    const sleep = full.sleep.filter((r) => r.day >= addDays(TODAY, -2));
    const body = Array.from({ length: 7 }, (_, i) => ({
      ...full.body[0]!,
      id: `b-${i}`,
      day: addDays(TODAY, -i),
    }));
    const d = await buildDashboard(
      createDemoSource({ ...full, sleep, checks: [], body }),
      range,
      TODAY,
    );
    const logging = d.score.components.find((c) => c.id === 'logging');
    expect(logging?.sample).toBe(new Set(sleep.map((r) => r.day)).size);
  });
});

describe('textos fictícios da demo (LEG-M03)', () => {
  it('não contêm alegações clínicas proibidas (ficam fora do i18n)', async () => {
    const { findForbiddenTerms } = await import('../../../tests/content/forbidden-terms');
    const data = generateDemoData(TODAY, TZ);
    const texts = [
      ...data.sleep.map((r) => r.note),
      ...data.habits.map((h) => h.name),
      ...data.meals.map((r) => r.description),
      ...data.activities.map((r) => r.note),
      ...data.activities.flatMap((r) => r.sets.map((x) => x.exercise)),
    ].filter((t): t is string => Boolean(t));
    expect(texts.length).toBeGreaterThan(0);
    for (const text of new Set(texts)) expect(findForbiddenTerms(text)).toEqual([]);
  });
});

describe('rotina da demo: alimentação, atividade, metas e lembretes (Fase 4)', () => {
  const data = generateDemoData(TODAY, TZ);
  const first = addDays(TODAY, -(DEMO_DAYS - 1));

  it('não muda as sequências anteriores (PRNG próprio)', () => {
    expect(data.sleep).toHaveLength(generateDemoData(TODAY, TZ).sleep.length);
    expect(data.sleep[0]?.id).toBe('demo-sleep-0');
  });

  it('cobre o período, dentro das faixas do banco', () => {
    expect(data.meals.length).toBeGreaterThan(150);
    expect(data.water.length).toBeGreaterThan(150);
    expect(data.activities.length).toBeGreaterThan(40);
    for (const r of [...data.meals, ...data.water, ...data.activities]) {
      expect(r.day >= first && r.day <= TODAY).toBe(true);
    }
    for (const a of data.activities) {
      expect(a.durationMin).toBeGreaterThanOrEqual(1);
      for (const s of a.sets) expect(s.reps).toBeGreaterThanOrEqual(1);
    }
    expect(data.activities.some((a) => a.sets.length > 0)).toBe(true);
  });

  it('sem calorias e sem meta de peso ou de calorias (LEG-M06, LEG-M07)', () => {
    expect(data.meals.every((m) => m.kcalEstimate === null)).toBe(true);
    expect(data.goals.some((g) => g.domain === 'weight' || g.domain === 'nutrition')).toBe(false);
    expect(data.goals.length).toBeGreaterThan(0);
    expect(data.reminders.length).toBeGreaterThan(0);
  });
});
