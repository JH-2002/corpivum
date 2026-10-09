import { bodyEntry, day } from '@/modules/insights/fixtures';
import { parseBodyModel } from './bodyModel';
import {
  bodyMorphWeights,
  modelGirthCm,
  MORPH_LIMITS,
  MORPH_NAMES,
  type BodyCalibration,
} from './morph';
import { BODY_REGIONS, COMPARE_FIELDS, type BodyRegion } from './regions';
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
  // Valores da variante neutra gerada pelo pipeline (arredondados).
  const calibration: BodyCalibration = {
    baseHeightM: 1.66,
    girthCm: {
      chest: { min: 72.6, base: 87.8, max: 105.1, sizeMin: 85.9, sizeMax: 92.6 },
      arm: { min: 17.1, base: 26.5, max: 36, sizeMin: 23.3, sizeMax: 29.5 },
      waist: { min: 59.5, base: 69.5, max: 79.9, sizeMin: 64.8, sizeMax: 77.7 },
      hip: { min: 85.5, base: 93.8, max: 110.6, sizeMin: 87.7, sizeMax: 100.8 },
      thigh: { min: 48.6, base: 53.1, max: 60.1, sizeMin: 47.6, sizeMax: 57.3 },
    },
  };
  const shapeOf = (values: Parameters<typeof bodyEntry>[1]) =>
    bodyShape(bodySnapshotAt([bodyEntry(day(0), values)], day(0)));
  const morphOf = (values: Parameters<typeof bodyEntry>[1]) =>
    bodyMorphWeights(shapeOf(values), calibration);
  const drawn = (values: Parameters<typeof bodyEntry>[1], region: BodyRegion) =>
    modelGirthCm(morphOf(values).weights, calibration, region);

  it('o peso não muda os morphs nem a escala', () => {
    expect(morphOf({ weightKg: 50, waistCm: 90 })).toEqual(morphOf({ weightKg: 150, waistCm: 90 }));
  });

  it('sem nenhuma medida: forma base da variante', () => {
    const { weights, scale } = morphOf({});
    for (const name of MORPH_NAMES) expect(weights[name]).toBe(0);
    expect(scale).toBe(1);
  });

  it('desenha a circunferência informada dentro da faixa do modelo', () => {
    const values = { chestCm: 100, waistCm: 92, hipCm: 108, thighCm: 60, armCm: 30 };
    expect(drawn(values, 'chest')).toBeCloseTo(100, 1);
    expect(drawn(values, 'waist')).toBeCloseTo(92, 1);
    expect(drawn(values, 'hip')).toBeCloseTo(108, 1);
    expect(drawn(values, 'thigh')).toBeCloseTo(60, 1);
    expect(drawn(values, 'arm')).toBeCloseTo(30, 1);
    expect(drawn({ waistCm: 62 }, 'waist')).toBeCloseTo(62, 1);
  });

  it('região sem medida fica na circunferência base enquanto os limites dos morphs permitem', () => {
    const values = { waistCm: 85, hipCm: 100 };
    expect(morphOf(values).weights.size_max).toBeGreaterThan(0);
    expect(drawn(values, 'arm')).toBeCloseTo(calibration.girthCm.arm.base, 1);
    expect(drawn(values, 'chest')).toBeCloseTo(calibration.girthCm.chest.base, 1);
    // Além do limite, a compensação para no máximo e a região acompanha parte do tamanho global.
    const big = morphOf({ waistCm: 100, hipCm: 120 }).weights;
    expect(big.thigh_min).toBe(MORPH_LIMITS.regionDown);
    const uncompensated = modelGirthCm({ ...big, thigh_min: 0 }, calibration, 'thigh');
    expect(drawn({ waistCm: 100, hipCm: 120 }, 'thigh')).toBeLessThan(uncompensated);
  });

  it('fora da faixa, a forma fica no limite (sem deformar) e cresce com a medida até lá', () => {
    const huge = morphOf({ waistCm: 180 }).weights;
    expect(huge.size_max).toBe(MORPH_LIMITS.sizeUp);
    expect(huge.waist_max).toBe(MORPH_LIMITS.regionUp);
    const tiny = morphOf({ waistCm: 45 }).weights;
    expect(tiny.size_min).toBe(MORPH_LIMITS.sizeDown);
    expect(tiny.waist_min).toBe(MORPH_LIMITS.regionDown);
    for (const w of [huge, tiny]) {
      for (const name of MORPH_NAMES) expect(w[name]).toBeGreaterThanOrEqual(0);
    }
    expect(drawn({ waistCm: 100 }, 'waist')).toBeGreaterThan(drawn({ waistCm: 90 }, 'waist'));
  });

  it('altura informada vira escala uniforme; sem altura, a da variante', () => {
    expect(morphOf({ heightCm: 182.6 }).scale).toBeCloseTo(1.1);
    expect(morphOf({ waistCm: 80 }).scale).toBe(1);
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
