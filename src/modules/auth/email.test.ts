// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { canonicalMailbox, normalizeEmail } from './email';
import { signKnownDevice, verifyKnownDevice } from './known-device';

describe('canonicalMailbox (PR1a-R3-M1)', () => {
  it.each([
    ['Pessoa@Exemplo.test', 'pessoa@exemplo.test'],
    ['pessoa+promo@exemplo.test', 'pessoa@exemplo.test'],
    ['p.e.s.s.o.a@gmail.com', 'pessoa@gmail.com'],
    ['P.essoa+x+y@GoogleMail.com', 'pessoa@gmail.com'],
    // Fora do Gmail, pontos fazem parte do endereço.
    ['p.essoa@exemplo.test', 'p.essoa@exemplo.test'],
    // "+" no início não é tag.
    ['+pessoa@exemplo.test', '+pessoa@exemplo.test'],
    ['sem-arroba', 'sem-arroba'],
  ])('%s → %s', (input, expected) => {
    expect(canonicalMailbox(input)).toBe(expected);
  });

  it('não altera a forma gravada (normalizeEmail)', () => {
    expect(normalizeEmail('  x+1@Gmail.com ')).toBe('x+1@gmail.com');
  });
});

describe('cookie de aparelho conhecido (OI-15)', () => {
  const secret = randomBytes(32);

  it('vale só para o e-mail assinado (normalizado) e devolve o nonce', () => {
    const v = signKnownDevice(secret, 'Pessoa@Exemplo.test');
    expect(verifyKnownDevice(secret, v, ' pessoa@exemplo.test ')).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(verifyKnownDevice(secret, v, 'outra@exemplo.test')).toBeNull();
    expect(verifyKnownDevice(randomBytes(32), v, 'pessoa@exemplo.test')).toBeNull();
  });

  it('não contém o e-mail e recusa formato inválido', () => {
    const v = signKnownDevice(secret, 'pessoa@exemplo.test');
    expect(v).not.toContain('pessoa');
    for (const bad of [undefined, '', 'v1.x.y', `${v}x`, v.replace('v1', 'v2')]) {
      expect(verifyKnownDevice(secret, bad, 'pessoa@exemplo.test')).toBeNull();
    }
  });

  it('cada emissão tem nonce próprio', () => {
    expect(signKnownDevice(secret, 'a@b.test')).not.toBe(signKnownDevice(secret, 'a@b.test'));
  });
});
