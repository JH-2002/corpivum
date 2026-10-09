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

  it('período sem dados vira no-data', async () => {
    const src = createDemoSource(data);
    const old = { from: '2020-01-01', to: '2020-01-31' };
    expect((await buildDashboard(src, old, TODAY)).state).toBe('no-data');
  });
});

describe('textos fictícios da demo (LEG-M03)', () => {
  it('não contêm alegações clínicas proibidas (ficam fora do i18n)', async () => {
    const { findForbiddenTerms } = await import('../../../tests/content/forbidden-terms');
    const data = generateDemoData(TODAY, TZ);
    const texts = [...data.sleep.map((r) => r.note), ...data.habits.map((h) => h.name)].filter(
      (t): t is string => Boolean(t),
    );
    expect(texts.length).toBeGreaterThan(0);
    for (const text of new Set(texts)) expect(findForbiddenTerms(text)).toEqual([]);
  });
});
