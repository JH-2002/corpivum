// @vitest-environment node
/**
 * Contraste WCAG 2.2 AA dos tokens de cor nos dois temas (§6, LEG-X01).
 * Texto: >= 4.5:1. Componentes de UI e foco (bordas de campo, anel de foco, cor de domínio em gráficos): >= 3:1.
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
    ...['sleep', 'mood', 'activity', 'nutrition', 'body', 'journal', 'medications'].map(
      (d): [string, string, number] => [`domain-${d}`, s, 4.5],
    ),
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

describe.each([
  ['claro', ':root'],
  ['escuro', '.dark'],
])('contraste no tema %s', (_name, selector) => {
  const tokens = readBlock(selector);

  it.each(PAIRS)('%s sobre %s >= %s:1', (fg, bg, min) => {
    const a = tokens.get(fg);
    const b = tokens.get(bg);
    expect(a, `token ausente: ${fg}`).toBeDefined();
    expect(b, `token ausente: ${bg}`).toBeDefined();
    expect(contrastRatio(a!, b!)).toBeGreaterThanOrEqual(min);
  });

  it('define todos os 10 neutros', () => {
    const neutrals = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((n) => `neutral-${n}`);
    expect(neutrals.every((n) => tokens.has(n))).toBe(true);
  });
});

describe('contrastRatio', () => {
  it('calcula os extremos conhecidos', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });
});
