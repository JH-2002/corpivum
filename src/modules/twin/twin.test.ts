import { bodyEntry, day } from '@/modules/insights/fixtures';
import { brainConfidence, TWIN_RULES } from './confidence';
import { BODY_REGIONS, BRAIN_REGION_THEMES, brainLobeAt, COMPARE_FIELDS } from './regions';
import { bodyShape } from './shape';
import { bodySnapshotAt, compareSnapshots, measurementDays } from './snapshot';

/** Dados sintéticos (CLAUDE.md regra 6). */
const records = [
  bodyEntry(day(0), { weightKg: 70, heightCm: 172, waistCm: 80, hipCm: 96 }),
  bodyEntry(day(3), { weightKg: 70.6 }),
  bodyEntry(day(6), { weightKg: 71, waistCm: 81.5 }),
];

describe('medidas vigentes por data (§15)', () => {
  it('datas do controle: dias com medição, sem repetir, em ordem', () => {
    expect(measurementDays([...records].reverse())).toEqual([day(0), day(3), day(6)]);
  });

  it('cada campo usa o último valor informado até o dia, com a data do registro', () => {
    const s = bodySnapshotAt(records, day(3));
    expect(s.values.weightKg).toEqual({ value: 70.6, day: day(3) });
    expect(s.values.waistCm).toEqual({ value: 80, day: day(0) });
    expect(s.values.chestCm).toBeUndefined();
    expect(bodySnapshotAt(records, day(6)).values.waistCm).toEqual({ value: 81.5, day: day(6) });
  });

  it('altura de antes do período entra sem data', () => {
    const s = bodySnapshotAt([bodyEntry(day(0), { waistCm: 80 })], day(0), 168);
    expect(s.values.heightCm).toEqual({ value: 168, day: null });
  });
});

describe('forma do corpo 3D (ADR-0026)', () => {
  it('medidas ausentes ficam na forma neutra e são listadas', () => {
    const shape = bodyShape(bodySnapshotAt([], day(0)));
    expect(shape.missing).toEqual([...BODY_REGIONS]);
    expect(shape.heightMissing).toBe(true);
    expect(shape.heightM).toBeCloseTo(1.7);
  });

  it('o peso não muda a forma', () => {
    const light = bodyShape(bodySnapshotAt([bodyEntry(day(0), { weightKg: 50 })], day(0)));
    const heavy = bodyShape(bodySnapshotAt([bodyEntry(day(0), { weightKg: 150 })], day(0)));
    expect(light).toEqual(heavy);
  });

  it('circunferência maior → raio maior; valores extremos limitados no desenho', () => {
    const at = (waistCm: number) =>
      bodyShape(bodySnapshotAt([bodyEntry(day(0), { waistCm })], day(0))).radius.waist;
    expect(at(90)).toBeGreaterThan(at(80));
    expect(at(300)).toBe(at(180));
    expect(at(10)).toBe(at(45));
    const tall = bodyShape(bodySnapshotAt([bodyEntry(day(0), { heightCm: 260 })], day(0)));
    expect(tall.heightM).toBe(2.2);
  });
});

describe('Antes × Agora (§16)', () => {
  it('diferença em número e direção, sem lado ausente', () => {
    const diff = compareSnapshots(bodySnapshotAt(records, day(0)), bodySnapshotAt(records, day(6)));
    expect(diff.map((d) => d.field)).toEqual([...COMPARE_FIELDS]);
    const by = Object.fromEntries(diff.map((d) => [d.field, d]));
    expect(by.weightKg).toMatchObject({ delta: 1, direction: 'up' });
    expect(by.waistCm).toMatchObject({ delta: 1.5, direction: 'up' });
    expect(by.hipCm).toMatchObject({ delta: 0, direction: 'same' });
    expect(by.chestCm).toMatchObject({ delta: null, direction: null });
  });

  it('diferença arredondada evita ruído de ponto flutuante', () => {
    const a = bodySnapshotAt([bodyEntry(day(0), { armCm: 30.1 })], day(0));
    const b = bodySnapshotAt([bodyEntry(day(1), { armCm: 29.9 })], day(1));
    expect(compareSnapshots(a, b).find((d) => d.field === 'armCm')).toMatchObject({
      delta: -0.2,
      direction: 'down',
    });
  });
});

describe('cérebro educativo (LEG-M05)', () => {
  it('divisão estilizada dos lobos', () => {
    expect(brainLobeAt({ outward: 0, y: 0.5, z: 0.8 })).toBe('frontal');
    expect(brainLobeAt({ outward: 0, y: 0.2, z: -0.9 })).toBe('occipital');
    expect(brainLobeAt({ outward: 0.8, y: -0.4, z: 0 })).toBe('temporal');
    expect(brainLobeAt({ outward: -0.8, y: -0.4, z: 0 })).toBe('parietal');
    expect(brainLobeAt({ outward: 0, y: 1, z: 0 })).toBe('parietal');
  });

  it('confiança mede só a suficiência dos registros, pelo tema menos coberto', () => {
    const days = { sleep: 20, mood: 5, habits: 1 };
    expect(brainConfidence([], days, 30)).toBe('none');
    expect(brainConfidence(['sleep'], days, 30)).toBe('high');
    expect(brainConfidence(['sleep', 'mood'], days, 30)).toBe('medium');
    expect(brainConfidence(['sleep', 'mood', 'habits'], days, 30)).toBe('low');
    // Muitos dias, mas pouca cobertura de um período longo: não chega a alto.
    expect(brainConfidence(['sleep'], days, 90)).toBe('medium');
    expect(TWIN_RULES.minDays).toBe(3);
  });

  it('regiões sem tema registrado no app são só educativas', () => {
    expect(BRAIN_REGION_THEMES.occipital).toEqual([]);
    expect(BRAIN_REGION_THEMES.frontal).toContain('sleep');
  });
});
