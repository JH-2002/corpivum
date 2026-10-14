// @vitest-environment node
import { bodyEntry, day } from '@/modules/insights/fixtures';
import {
  BODY_MODELS,
  BODY_REGIONS,
  bodyMorphWeights,
  bodyShape,
  bodySnapshotAt,
  drawnTolerance,
  MORPH_NAMES,
  outOfDrawingRange,
  REGION_FIELD,
  type BodyModel,
  type BodyRegion,
  type MorphName,
} from '@/modules/twin';
import { BODY_ASSETS } from '@/modules/twin/bodyAssets';
import { loadBody, measureGirth } from './body-geometry';

/**
 * Medidas verificadas na geometria real do `.glb` (ADR-0028; seções 8 e 9 de docs/specs/twin-ajustes-corporais.md),
 * com as tolerâncias aprovadas:
 * - base × referência: máx(0,5 cm; 1%);
 * - medida informada dentro da faixa do desenho: máx(1,0 cm; 2%), em 150, 170 e 190 cm de altura;
 * - interferência: mudar uma medida em 10 cm muda as outras, no desenho, em até 1,0 cm;
 * - fora da faixa: a forma fica no limite, cresce com a medida até lá, e o painel avisa.
 * Os valores de referência são só de calibração: não são padrão de saúde nem de beleza (nunca exibidos).
 */
const REFERENCE: Record<BodyModel, Record<BodyRegion, number>> = {
  feminine: { chest: 86, arm: 25, waist: 68, hip: 96, thigh: 54 },
  masculine: { chest: 96, arm: 31, waist: 80, hip: 98, thigh: 57 },
};
const baseTolerance = (cm: number) => Math.max(0.5, 0.01 * cm);
const zero = Object.fromEntries(MORPH_NAMES.map((n) => [n, 0])) as Record<MorphName, number>;

type Girths = Partial<Record<BodyRegion, number>>;
const shapeOf = (girths: Girths, heightCm?: number) =>
  bodyShape(
    bodySnapshotAt(
      [
        bodyEntry(day(0), {
          ...(heightCm === undefined ? {} : { heightCm }),
          ...Object.fromEntries(
            Object.entries(girths).map(([r, v]) => [REGION_FIELD[r as BodyRegion], v]),
          ),
        }),
      ],
      day(0),
    ),
  );

describe.each(BODY_MODELS)('geometria do modelo %s', (model) => {
  const asset = BODY_ASSETS[model]!;
  const reference = REFERENCE[model];
  let parts: Awaited<ReturnType<typeof loadBody>>;
  beforeAll(async () => {
    parts = await loadBody(asset);
  });

  /** Circunferências desenhadas (malha final) para as medidas informadas. */
  const drawn = (girths: Girths, heightCm?: number) => {
    const { weights, scale } = bodyMorphWeights(shapeOf(girths, heightCm), asset.calibration);
    return Object.fromEntries(
      BODY_REGIONS.map((r) => [r, measureGirth(parts, weights, scale, asset.measure[r])]),
    ) as Record<BodyRegion, number>;
  };

  it('a base reproduz a referência da seção 4 dentro de máx(0,5 cm; 1%)', () => {
    for (const region of BODY_REGIONS) {
      const girth = measureGirth(parts, zero, [1, 1, 1], asset.measure[region]);
      expect({
        region,
        ok: Math.abs(girth - reference[region]) <= baseTolerance(reference[region]),
      }).toEqual({
        region,
        ok: true,
      });
    }
  });

  it('a calibração do manifesto bate com a geometria (base)', () => {
    for (const region of BODY_REGIONS) {
      expect(measureGirth(parts, zero, [1, 1, 1], asset.measure[region])).toBeCloseTo(
        asset.calibration.girthCm[region].base,
        0,
      );
    }
  });

  // A 1,70 m, tudo dentro da faixa do desenho. Nos extremos de estatura, uma combinação muito longe da
  // proporção da base (ex.: peito −8% a 1,90 m no modelo de 1,60 m) pode sair da faixa: aí o painel avisa, e o
  // desenho vai na direção pedida sem passar dela. No máximo dois casos assim por modelo.
  let outside = 0;
  it.each(BODY_REGIONS)(
    '%s em valores baixo, intermediário e alto, nas três estaturas: desenho = informado',
    (region) => {
      for (const factor of [0.92, 1, 1.12]) {
        for (const heightCm of [150, 170, 190]) {
          const girths = {
            ...reference,
            [region]: Math.round(reference[region] * factor * 10) / 10,
          };
          const flagged = outOfDrawingRange(shapeOf(girths, heightCm), asset.calibration);
          const result = drawn(girths, heightCm);
          for (const r of BODY_REGIONS) {
            const error = Math.abs(result[r] - girths[r]);
            const ok = error <= drawnTolerance(girths[r]);
            if (ok) continue;
            outside += 1;
            const base = drawn(reference, heightCm)[r];
            expect({ region, factor, heightCm, r, flagged: flagged.includes(r) }).toEqual({
              region,
              factor,
              heightCm,
              r,
              flagged: true,
            });
            expect(heightCm).not.toBe(170);
            // Na direção pedida, sem passar do valor informado.
            expect(Math.sign(result[r] - base)).toBe(Math.sign(girths[r] - base));
            expect(Math.abs(result[r] - base)).toBeLessThanOrEqual(Math.abs(girths[r] - base));
          }
        }
      }
    },
  );

  it('fora da faixa só em casos raros (até dois por modelo)', () => {
    expect(outside).toBeLessThanOrEqual(2);
  });
  it('sem altura informada, a escala é a da variante e o desenho segue as medidas', () => {
    const result = drawn(reference);
    for (const r of BODY_REGIONS) {
      expect(Math.abs(result[r] - reference[r])).toBeLessThanOrEqual(drawnTolerance(reference[r]));
    }
  });

  it.each(BODY_REGIONS)('mudar %s em 10 cm muda as outras regiões em até 1,0 cm', (region) => {
    const before = drawn(reference, 170);
    const after = drawn({ ...reference, [region]: reference[region] + 10 }, 170);
    for (const r of BODY_REGIONS) {
      if (r === region) continue;
      expect({ r, delta: Math.abs(after[r] - before[r]) <= 1 }).toEqual({ r, delta: true });
    }
  });

  it('fora da faixa: forma no limite, sem passar do pedido, e o painel é avisado', () => {
    const huge = { ...reference, waist: 175 };
    expect(outOfDrawingRange(shapeOf(huge, 170), asset.calibration)).toContain('waist');
    const atLimit = drawn(huge, 170).waist;
    const bigger = drawn({ ...reference, waist: reference.waist + 15 }, 170).waist;
    expect(atLimit).toBeGreaterThanOrEqual(bigger);
    expect(atLimit).toBeLessThan(175);
  });
});
