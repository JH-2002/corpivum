import { bodyEntry, day } from '@/modules/insights/fixtures';
import { parseBodyModel } from './bodyModel';
import { bodyMorphWeights, MORPH_NAMES, type BodyCalibration } from './morph';
import { BODY_REGIONS, COMPARE_FIELDS } from './regions';
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

describe('morph targets do corpo .glb (ADR-0028)', () => {
  const calibration: BodyCalibration = {
    baseHeightM: 1.7,
    girthCm: {
      chest: { min: 75, base: 94, max: 130 },
      arm: { min: 22, base: 29, max: 45 },
      waist: { min: 62, base: 82, max: 130 },
      hip: { min: 80, base: 98, max: 140 },
      thigh: { min: 42, base: 55, max: 80 },
    },
  };
  const morphOf = (values: Parameters<typeof bodyEntry>[1]) =>
    bodyMorphWeights(bodyShape(bodySnapshotAt([bodyEntry(day(0), values)], day(0))), calibration);

  it('o peso não muda os morphs nem a escala', () => {
    expect(morphOf({ weightKg: 50, waistCm: 90 })).toEqual(morphOf({ weightKg: 150, waistCm: 90 }));
  });

  it('medida ausente fica na forma base da variante', () => {
    const { weights, scale } = morphOf({});
    for (const name of MORPH_NAMES) expect(weights[name]).toBe(0);
    expect(scale).toBeCloseTo(1);
  });

  it('interpola pela calibração em cm, só um lado por região e sempre entre 0 e 1', () => {
    expect(morphOf({ waistCm: 82 }).weights).toMatchObject({ waist_min: 0, waist_max: 0 });
    expect(morphOf({ waistCm: 106 }).weights.waist_max).toBeCloseTo(0.5);
    expect(morphOf({ waistCm: 72 }).weights).toMatchObject({ waist_min: 0.5, waist_max: 0 });
    expect(morphOf({ waistCm: 180 }).weights.waist_max).toBe(1);
    expect(morphOf({ waistCm: 45 }).weights.waist_min).toBe(1);
    expect(morphOf({ waistCm: 100 }).weights.waist_max).toBeGreaterThan(
      morphOf({ waistCm: 90 }).weights.waist_max,
    );
  });

  it('altura informada vira escala uniforme; sem altura, a da variante', () => {
    expect(morphOf({ heightCm: 187 }).scale).toBeCloseTo(1.1);
    const tall = { ...calibration, baseHeightM: 1.8 };
    const shape = bodyShape(bodySnapshotAt([bodyEntry(day(0), { waistCm: 80 })], day(0)));
    expect(bodyMorphWeights(shape, tall).scale).toBe(1);
  });
});

describe('modelo de visualização (ADR-0028)', () => {
  it('padrão neutro; valor inválido vira neutro', () => {
    expect(parseBodyModel(null)).toBe('neutral');
    expect(parseBodyModel('outro')).toBe('neutral');
    expect(parseBodyModel('feminine')).toBe('feminine');
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
