// @vitest-environment node
import { stableTestClock } from './clock';

describe('stableTestClock (PR1a-R3-B5)', () => {
  it('mantém o horário real no meio da hora', () => {
    const real = new Date('2026-10-06T22:20:00Z');
    expect(stableTestClock(real)).toEqual(real);
  });

  it('perto da virada (caso da falha na CI, 22:59:09) adianta para 1 min após a próxima hora', () => {
    expect(stableTestClock(new Date('2026-10-06T22:59:09Z'))).toEqual(
      new Date('2026-10-06T23:01:00Z'),
    );
    expect(stableTestClock(new Date('2026-10-06T22:40:00Z'))).toEqual(
      new Date('2026-10-06T23:01:00Z'),
    );
  });

  it('nos primeiros segundos da hora adianta só até 1 min depois dela', () => {
    expect(stableTestClock(new Date('2026-10-06T23:00:10Z'))).toEqual(
      new Date('2026-10-06T23:01:00Z'),
    );
  });

  it('nunca atrasa e deixa pelo menos 20 min até a virada', () => {
    for (let m = 0; m < 60; m++) {
      const real = new Date(Date.UTC(2026, 9, 6, 22, m, 30));
      const c = stableTestClock(real);
      expect(c.getTime()).toBeGreaterThanOrEqual(real.getTime());
      expect(60 - c.getUTCMinutes()).toBeGreaterThanOrEqual(20);
    }
  });
});
