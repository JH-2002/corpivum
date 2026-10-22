import { axisWidth, niceStep, niceTicks, paddedDomain, yAxisConfig } from './domain';
import { formatNumber } from './format';

describe('paddedDomain (faixa mínima do eixo, LEG-M06)', () => {
  it('variação pequena: faixa de ±2 em torno da média, arredondada para fora', () => {
    expect(paddedDomain([73.9, 74.1, 73.95], { minSpan: 4 })).toEqual([70, 76]);
  });

  it('a faixa desliza para conter todos os valores', () => {
    const [lo, hi] = paddedDomain([70, 70, 70, 73.5], { minSpan: 4 })!;
    expect(lo).toBeLessThanOrEqual(70);
    expect(hi).toBeGreaterThanOrEqual(73.5);
    expect(hi - lo).toBeGreaterThanOrEqual(4);
  });

  it('dados que excedem a faixa: ajusta aos dados com folga', () => {
    expect(paddedDomain([60, 80], { minSpan: 4 })).toEqual([50, 90]);
  });

  it('ignora nulos e, sem valores, deixa o eixo automático', () => {
    expect(paddedDomain([null, undefined], { minSpan: 4 })).toBeUndefined();
    expect(paddedDomain([null, 50, undefined], { minSpan: 4 })).toEqual([48, 52]);
  });

  it('não vai abaixo de zero com valores positivos', () => {
    expect(paddedDomain([0.5, 1], { minSpan: 4 })![0]).toBe(0);
  });
});

describe('tiques redondos', () => {
  it('passo 1, 2 ou 5 × 10^n em até 4 intervalos', () => {
    expect(niceStep(5)).toBe(2);
    expect(niceStep(4)).toBe(1);
    expect(niceStep(40)).toBe(10);
    expect(niceStep(0.8)).toBe(0.2);
  });

  it('os limites de paddedDomain caem nos tiques, sem tique avulso', () => {
    for (const values of [
      [73.9, 74.1],
      [70, 70, 73.5],
      [60, 80],
      [84.2, 85.1, 31.5],
    ]) {
      const domain = paddedDomain(values, { minSpan: 4 })!;
      const ticks = niceTicks(domain);
      expect(ticks[0]).toBe(domain[0]);
      expect(ticks.at(-1)).toBe(domain[1]);
      expect(ticks.length).toBeLessThanOrEqual(5);
    }
  });
});

describe('yAxisConfig', () => {
  const data = [
    { day: '2026-10-01', kg: 73.95, n: 2 },
    { day: '2026-10-02', kg: 74.1, n: 3 },
  ];

  it('barras começam em zero, mesmo com domínio informado', () => {
    const c = yAxisConfig(data, [{ key: 'n', kind: 'bar' }], 'left', [2, 3], formatNumber);
    expect(c.domain).toEqual([0, 'auto']);
  });

  it('linha usa o domínio informado', () => {
    const c = yAxisConfig(data, [{ key: 'kg', kind: 'line' }], 'left', [72, 76], formatNumber);
    expect(c.domain).toEqual([72, 76]);
    expect(c.ticks).toEqual([72, 73, 74, 75, 76]);
  });

  it('contagens: eixo sem decimais', () => {
    const c = yAxisConfig(
      data,
      [{ key: 'n', kind: 'bar', integer: true }],
      'left',
      undefined,
      formatNumber,
    );
    expect(c.allowDecimals).toBe(false);
    expect(c.decimals).toBe(0);
  });

  it('a largura cabe o rótulo inteiro ("73,95" com 2 casas)', () => {
    const c = yAxisConfig(
      data,
      [{ key: 'kg', kind: 'line', decimals: 2 }],
      'left',
      undefined,
      formatNumber,
    );
    expect(c.width).toBeGreaterThanOrEqual(axisWidth(['73,95']));
    expect(axisWidth(['1'])).toBe(44);
    expect(axisWidth(['12345,67'])).toBeGreaterThan(44);
  });

  it('séries do outro eixo não entram', () => {
    const c = yAxisConfig(
      data,
      [{ key: 'n', kind: 'bar', axis: 'right' }],
      'left',
      undefined,
      formatNumber,
    );
    expect(c.domain).toEqual(['auto', 'auto']);
  });
});
