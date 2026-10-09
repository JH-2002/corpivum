import { bodyEntry, day, TODAY, WEEK } from './fixtures';
import { INSIGHT_RULES } from './rules';
import { twinBodyInsights } from './twin';
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
