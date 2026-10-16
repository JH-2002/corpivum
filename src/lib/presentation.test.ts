import { PRESENTING_MAX_AGE_MS, presentingValid } from './presentation';

describe('marca de apresentação em curso (ADR-0035)', () => {
  const now = 1_800_000_000_000;

  it('vale só no prazo de até 4 h', () => {
    expect(presentingValid(`on.${now + 60_000}`, now)).toBe(true);
    expect(presentingValid(`on.${now + PRESENTING_MAX_AGE_MS}`, now)).toBe(true);
    expect(presentingValid(`on.${now}`, now)).toBe(false);
    expect(presentingValid(`on.${now + PRESENTING_MAX_AGE_MS + 1}`, now)).toBe(false);
  });

  it('valores antigos ou adulterados não valem (levam à tela de entrada)', () => {
    for (const v of [
      undefined,
      '',
      'on',
      'off',
      'on.',
      'on.abc',
      `on.${now + 1}x`,
      ` on.${now + 1}`,
    ]) {
      expect(presentingValid(v, now)).toBe(false);
    }
  });
});
