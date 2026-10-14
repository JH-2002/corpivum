// @vitest-environment node
import { Vector3 } from 'three';
import { bodyEntry, day } from '@/modules/insights/fixtures';
import {
  BODY_MODELS,
  bodyMorphWeights,
  bodyShape,
  bodySnapshotAt,
  MORPH_LIMITS,
  MORPH_NAMES,
  REGION_FIELD,
  type BodyModel,
  type BodyRegion,
  type MorphName,
} from '@/modules/twin';
import { BODY_ASSETS } from '@/modules/twin/bodyAssets';
import { loadBody, positions, type Part } from './body-geometry';

/**
 * Pose dos modelos (ADR-0028, revisão de 2026-10-13): braços próximos ao corpo (úmero a 10–15° da vertical), mãos
 * ao lado das coxas sem encostar, ombro masculino mais largo que o quadril e nenhum braço ou mão atravessando o
 * tronco ou a coxa, na base e com os morphs que engrossam o corpo no limite de extrapolação do app (lá o braço abre
 * um pouco junto). A dobra da axila, onde braço e tronco se tocam como num corpo real, fica de fora: a conferência
 * começa 2 cm abaixo do plano de medida do braço.
 */
const zero = () => Object.fromEntries(MORPH_NAMES.map((n) => [n, 0])) as Record<MorphName, number>;
const withWeights = (over: Partial<Record<MorphName, number>>) => ({ ...zero(), ...over });

/** Corpos grandes plausíveis (cm), resolvidos pelo app como para qualquer pessoa. */
const LARGE: Record<BodyModel, Record<BodyRegion, number>> = {
  feminine: { chest: 115, arm: 38, waist: 100, hip: 130, thigh: 72 },
  masculine: { chest: 120, arm: 40, waist: 115, hip: 120, thigh: 70 },
};

interface Mesh {
  arm: Vector3[];
  hands: Vector3[];
  body: { p: Vector3; n: Vector3 }[];
  hip: Vector3[];
  all: Vector3[];
}

/** Vértices posicionados por grupo, com a normal (recalculada após os morphs) no tronco e nas coxas. */
function split(
  parts: Part[],
  weights: Record<MorphName, number>,
  armY: number,
  thighY: number,
): Mesh {
  const pos = positions(parts, weights, new Vector3(1, 1, 1));
  const out: Mesh = { arm: [], hands: [], body: [], hip: [], all: [] };
  parts.forEach((part, pi) => {
    const pts = pos[pi]!;
    out.all.push(...pts);
    if (part.material === 'region_arm') {
      out.arm.push(...pts.filter((p) => p.y < armY));
    } else if (part.material === 'region_rest') {
      // Mãos: entre o joelho e o braço (cabeça acima, pernas abaixo).
      out.hands.push(...pts.filter((p) => p.y < armY && p.y > thighY - 0.2));
    } else {
      const normals = pts.map(() => new Vector3());
      const count = part.index ? part.index.length : pts.length;
      for (let t = 0; t < count; t += 3) {
        const [a, b, c] = [0, 1, 2].map((j) => (part.index ? part.index[t + j]! : t + j));
        const n = pts[b!]!.clone().sub(pts[a!]!).cross(pts[c!]!.clone().sub(pts[a!]!));
        for (const v of [a!, b!, c!]) normals[v]!.add(n);
      }
      pts.forEach((p, i) => out.body.push({ p, n: normals[i]!.normalize() }));
      if (part.material === 'region_hip') out.hip.push(...pts);
    }
  });
  return out;
}

/** Menor folga (cm, com sinal pela normal do vértice do corpo mais próximo): negativo = atravessa. */
function clearanceCm(mesh: Mesh): number {
  let best = Infinity;
  for (const p of [...mesh.arm, ...mesh.hands]) {
    let nearest = mesh.body[0]!;
    let dist = Infinity;
    for (const b of mesh.body) {
      const d = p.distanceToSquared(b.p);
      if (d < dist) {
        dist = d;
        nearest = b;
      }
    }
    best = Math.min(best, p.clone().sub(nearest.p).dot(nearest.n));
  }
  return 100 * best;
}

describe.each(BODY_MODELS)('pose do modelo %s', (model) => {
  const asset = BODY_ASSETS[model]!;
  const armY = asset.measure.arm.point[1] - 0.02;
  const thighY = asset.measure.thigh.point[1];
  let parts: Part[];
  beforeAll(async () => {
    parts = await loadBody(asset);
  });

  it('úmero entre 10° e 15° da vertical (braços próximos ao corpo, sem pose A)', () => {
    const [x, y, z] = asset.calibration.armAxis!;
    const degrees = (Math.acos(-y / Math.hypot(x, y, z)) * 180) / Math.PI;
    expect(degrees).toBeGreaterThanOrEqual(10);
    expect(degrees).toBeLessThanOrEqual(15);
  });

  it('mãos ao lado das coxas, sem encostar (folga de pelo menos 1 cm na base)', () => {
    const mesh = split(parts, zero(), armY, thighY);
    expect(mesh.hands.length).toBeGreaterThan(0);
    let gap = Infinity;
    for (const h of mesh.hands) for (const b of mesh.body) gap = Math.min(gap, h.distanceTo(b.p));
    expect(100 * gap).toBeGreaterThanOrEqual(1);
    // Ao lado das coxas: a ponta dos dedos fica abaixo da entreperna (plano da coxa).
    expect(Math.min(...mesh.hands.map((h) => h.y))).toBeLessThan(thighY);
  });

  const extremes: [string, Partial<Record<MorphName, number>>][] = [
    ['base', {}],
    ['tamanho no limite', { size_max: MORPH_LIMITS.sizeUp }],
    ...(['chest', 'arm', 'waist', 'hip', 'thigh'] as const).map(
      (r) =>
        [`${r} no limite`, { [`${r}_max`]: MORPH_LIMITS.regionUp }] as [
          string,
          Partial<Record<MorphName, number>>,
        ],
    ),
  ];
  it.each(extremes)('braço e mão não atravessam tronco nem coxa: %s', (_, over) => {
    expect(clearanceCm(split(parts, withWeights(over), armY, thighY))).toBeGreaterThan(0);
  });

  it('corpo grande resolvido pelo app: braço e mão não atravessam tronco nem coxa', () => {
    const girths = LARGE[model];
    const shape = bodyShape(
      bodySnapshotAt(
        [
          bodyEntry(day(0), {
            heightCm: 170,
            ...Object.fromEntries(
              Object.entries(girths).map(([r, v]) => [REGION_FIELD[r as BodyRegion], v]),
            ),
          }),
        ],
        day(0),
      ),
    );
    const { weights } = bodyMorphWeights(shape, asset.calibration);
    expect(clearanceCm(split(parts, weights, armY, thighY))).toBeGreaterThan(0);
  });

  if (model === 'masculine') {
    it('ombros (deltoides) mais largos que o quadril, na base', () => {
      const mesh = split(parts, zero(), Infinity, thighY);
      // Deltoides: faixa de 6 cm abaixo do topo do braço. Quadril: primitiva do quadril no plano de medida.
      const armTop = Math.max(...mesh.arm.map((p) => p.y));
      const width = (pts: Vector3[]) =>
        Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
      const shoulders = width(mesh.all.filter((p) => p.y > armTop - 0.06 && p.y <= armTop));
      const hipY = asset.measure.hip.point[1];
      const hips = width(mesh.hip.filter((p) => Math.abs(p.y - hipY) < 0.01));
      expect(shoulders).toBeGreaterThan(hips);
    });
  }
});
