import { generateDemoData } from '@/modules/demo/generator';
import { bodyEntry, checksOn, day, habit, moodWeek, sleepWeek, TODAY, WEEK } from './fixtures';
import { INSIGHT_RULES } from './rules';
import { brainInsights, brainThemes, twinBodyInsights } from './twin';
import type { ModuleInsights } from './types';

const keys = (i: ModuleInsights) => i.sentences.map((s) => s.key);

describe('resumo do corpo 3D (ADR-0025/0026)', () => {
  it('vazio: forma neutra, sem valores', () => {
    const i = twinBodyInsights({ records: [], latestHeightCm: null, range: WEEK, today: TODAY });
    expect(i).toMatchObject({ module: 'twin', state: 'empty' });
    expect(keys(i)).toEqual(['empty']);
  });

  it('uma data só: parcial, conta as medidas que dão forma', () => {
    const i = twinBodyInsights({
      records: [bodyEntry(day(0), { waistCm: 80, weightKg: 70 })],
      latestHeightCm: 170,
      range: WEEK,
      today: TODAY,
    });
    expect(i.state).toBe('partial');
    expect(keys(i)).toEqual(['shapeFrom', 'partial', 'neutral']);
    expect(i.sentences[0]?.args.count).toEqual({ kind: 'int', value: 2 });
    expect(i.sentences[2]?.args.count).toEqual({ kind: 'int', value: 4 });
  });

  it('completo: datas do controle e aviso de que o peso não dá forma; sem IMC', () => {
    const i = twinBodyInsights({
      records: [
        bodyEntry(day(0), { weightKg: 70, heightCm: 172, waistCm: 80, hipCm: 96 }),
        bodyEntry(day(6), { weightKg: 71, chestCm: 95, armCm: 30, thighCm: 55 }),
      ],
      latestHeightCm: null,
      range: WEEK,
      today: TODAY,
    });
    expect(i.state).toBe('ok');
    expect(keys(i)).toEqual(['shapeFrom', 'dates', 'weightNote']);
    expect(i.sentences.length).toBeLessThanOrEqual(INSIGHT_RULES.maxSentences);
    expect(JSON.stringify(i)).not.toMatch(/bmi|imc/i);
  });
});

describe('temas do cérebro 3D (§17, LEG-M05)', () => {
  const input = {
    sleep: sleepWeek(WEEK, [420, 400, 450, 430]),
    mood: moodWeek(WEEK, [4, 3, 4, undefined, 4]),
    habits: [habit({ name: 'Nome que não pode sair do servidor' })],
    checks: checksOn('h1', [day(0), day(1)]),
    range: WEEK,
  };

  it('resume cada tema em números, sem nome de hábito nem nota', () => {
    const t = brainThemes(input);
    expect(t.periodDays).toBe(7);
    expect(t.themes.sleep.days).toBe(4);
    expect(t.themes.mood.days).toBe(4);
    expect(t.themes.habits.days).toBe(2);
    expect(t.themes.sleep.indicators.map((x) => x.key)).toEqual(['sleepAverage', 'sleepSpread']);
    expect(t.themes.habits.indicators[0]?.value).toEqual({ kind: 'int', value: 29 });
    expect(JSON.stringify(t)).not.toMatch(/Nome que não pode/);
    expect(t.supportSignal).toBe(false);
  });

  it('humor no ponto mais baixo mostra a orientação de apoio', () => {
    const t = brainThemes({ ...input, mood: moodWeek(WEEK, [1, 3]) });
    expect(t.supportSignal).toBe(true);
    expect(brainInsights(t, WEEK, TODAY).supportSignal).toBe(true);
  });

  it('resumo: vazio, parcial e completo; sempre educativo', () => {
    const empty = brainThemes({ sleep: [], mood: [], habits: [], checks: [], range: WEEK });
    expect(brainInsights(empty, WEEK, TODAY)).toMatchObject({ module: 'brain', state: 'empty' });
    expect(keys(brainInsights(empty, WEEK, TODAY))).toEqual(['empty', 'educational']);

    const partial = brainInsights(brainThemes(input), WEEK, TODAY);
    expect(partial.state).toBe('partial');
    expect(keys(partial)).toEqual(['themesUsed', 'educational', 'pickRegion']);

    const full = brainInsights(
      brainThemes({ ...input, checks: checksOn('h1', [day(0), day(1), day(2)]) }),
      WEEK,
      TODAY,
    );
    expect(full.state).toBe('ok');
  });

  it('dados de demonstração: amostra suficiente nos três temas', () => {
    const demo = generateDemoData(TODAY, 'America/Sao_Paulo');
    const t = brainThemes({ ...demo, range: WEEK });
    expect(brainInsights(t, WEEK, TODAY).state).toBe('ok');
  });
});
