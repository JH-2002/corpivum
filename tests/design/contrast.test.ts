// @vitest-environment node
/**
 * Contraste WCAG 2.2 AA dos tokens de cor do tema único escuro (§6, LEG-X01, ADR-0046).
 * Texto: >= 4.5:1. Componentes de UI e foco (bordas de campo, anel de foco): >= 3:1. Marcas dos gráficos (linhas,
 * barras) da paleta `chart-*`: >= 3:1 (WCAG 1.4.11) e cores vizinhas distinguíveis entre si.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  fileURLToPath(new URL('../../src/styles/tokens.css', import.meta.url)),
  'utf8',
);

function readBlock(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`bloco ${selector} não encontrado`);
  const body = css.slice(start, css.indexOf('}', start));
  return new Map(
    [...body.matchAll(/--hm-([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1]!, m[2]!]),
  );
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const SURFACES = ['bg', 'surface', 'surface-muted'];
/** Ordem fixa das séries num gráfico com várias séries. */
const CHART_PALETTE = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5'];

/** Distância perceptual OKLab × 100 (a mesma escala do validador da skill dataviz). */
function oklabDistance(a: string, b: string): number {
  const lab = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * bl);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * bl);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * bl);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
  };
  const [x, y] = [lab(a), lab(b)];
  return 100 * Math.hypot(x[0]! - y[0]!, x[1]! - y[1]!, x[2]! - y[2]!);
}

/** [primeiro plano, fundo, mínimo] */
const PAIRS: Array<[string, string, number]> = [
  ...SURFACES.flatMap((s): Array<[string, string, number]> => [
    ['fg', s, 4.5],
    ['fg-muted', s, 4.5],
    ['primary', s, 4.5],
    ['secondary', s, 4.5],
    ['success', s, 4.5],
    ['warning', s, 4.5],
    ['danger', s, 4.5],
    ['info', s, 4.5],
    ['border-strong', s, 3],
    ['focus', s, 3],
    ...['sleep', 'activity', 'nutrition', 'body'].map((d): [string, string, number] => [
      `domain-${d}`,
      s,
      4.5,
    ]),
    // Paleta dos gráficos: marcas gráficas, não texto (o texto dos gráficos usa fg e fg-muted).
    ...CHART_PALETTE.map((c): [string, string, number] => [c, s, 3]),
    ['chart-neutral', s, 3],
  ]),
  ['primary-fg', 'primary', 4.5],
  ['primary-fg', 'primary-hover', 4.5],
  ['secondary-fg', 'secondary', 4.5],
  ['primary-soft-fg', 'primary-soft', 4.5],
  ['secondary-soft-fg', 'secondary-soft', 4.5],
  ['fg', 'primary-soft', 4.5],
  ['success', 'success-soft', 4.5],
  ['warning', 'warning-soft', 4.5],
  ['danger', 'danger-soft', 4.5],
  ['info', 'info-soft', 4.5],
  ['fg', 'success-soft', 4.5],
  ['fg', 'warning-soft', 4.5],
  ['fg', 'danger-soft', 4.5],
  ['fg', 'info-soft', 4.5],
];

describe('contraste no tema escuro', () => {
  const tokens = readBlock(':root');

  it.each(PAIRS)('%s sobre %s >= %s:1', (fg, bg, min) => {
    const a = tokens.get(fg);
    const b = tokens.get(bg);
    expect(a, `token ausente: ${fg}`).toBeDefined();
    expect(b, `token ausente: ${bg}`).toBeDefined();
    expect(contrastRatio(a!, b!)).toBeGreaterThanOrEqual(min);
  });

  it('cores vizinhas da paleta dos gráficos são distinguíveis (OKLab ΔE >= 15)', () => {
    for (let i = 1; i < CHART_PALETTE.length; i++) {
      const a = tokens.get(CHART_PALETTE[i - 1]!)!;
      const b = tokens.get(CHART_PALETTE[i]!)!;
      expect(oklabDistance(a, b), `${a} × ${b}`).toBeGreaterThanOrEqual(15);
    }
  });

  it('define todos os 10 neutros', () => {
    const neutrals = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((n) => `neutral-${n}`);
    expect(neutrals.every((n) => tokens.has(n))).toBe(true);
  });

  it('não tem mais tema claro nem bloco .dark', () => {
    expect(css).not.toMatch(/\.dark\s*\{/);
    expect(css).toMatch(/color-scheme:\s*dark;/);
  });
});

describe('contrastRatio', () => {
  it('calcula os extremos conhecidos', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });
});
