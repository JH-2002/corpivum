import { axisWidth, paddedDomain, yAxisConfig } from './domain';
import { formatNumber } from './format';

describe('paddedDomain (faixa mínima do eixo, LEG-M06)', () => {
  it('variação pequena: faixa de ±2 em torno da média, arredondada para fora', () => {
    expect(paddedDomain([73.9, 74.1, 73.95], { minSpan: 4 })).toEqual([71, 76]);
  });

  it('a faixa desliza para conter todos os valores', () => {
    const [lo, hi] = paddedDomain([70, 70, 70, 73.5], { minSpan: 4 })!;
    expect(lo).toBeLessThanOrEqual(70);
    expect(hi).toBeGreaterThanOrEqual(73.5);
    expect(hi - lo).toBeGreaterThanOrEqual(4);
  });

  it('dados que excedem a faixa: ajusta aos dados com folga', () => {
    expect(paddedDomain([60, 80], { minSpan: 4 })).toEqual([58, 82]);
  });

  it('ignora nulos e, sem valores, deixa o eixo automático', () => {
    expect(paddedDomain([null, undefined], { minSpan: 4 })).toBeUndefined();
    expect(paddedDomain([null, 50, undefined], { minSpan: 4 })).toEqual([48, 52]);
  });

  it('não vai abaixo de zero com valores positivos', () => {
    expect(paddedDomain([0.5, 1], { minSpan: 4 })![0]).toBe(0);
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
    const c = yAxisConfig(data, [{ key: 'kg', kind: 'line' }], 'left', [71, 76], formatNumber);
    expect(c.domain).toEqual([71, 76]);
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
