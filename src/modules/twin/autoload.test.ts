import { canAutoload3D } from './autoload';

describe('3D automático no celular (ADR-0049)', () => {
  it('sem sinais (ex.: iOS Safari), permite', () => {
    expect(canAutoload3D({})).toBe(true);
  });

  it('aparelho bom em 4G: permite', () => {
    expect(
      canAutoload3D({
        saveData: false,
        effectiveType: '4g',
        deviceMemory: 8,
        hardwareConcurrency: 8,
      }),
    ).toBe(true);
    expect(canAutoload3D({ deviceMemory: 4, hardwareConcurrency: 4 })).toBe(true);
  });

  it('economia de dados, rede lenta, pouca memória ou poucos núcleos: não carrega sozinho', () => {
    expect(canAutoload3D({ saveData: true })).toBe(false);
    for (const effectiveType of ['slow-2g', '2g', '3g']) {
      expect(canAutoload3D({ effectiveType }), effectiveType).toBe(false);
    }
    expect(canAutoload3D({ deviceMemory: 2 })).toBe(false);
    expect(canAutoload3D({ hardwareConcurrency: 2 })).toBe(false);
  });
});
