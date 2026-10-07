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
  const H = '$argon2id$v=19$m=19456,t=2,p=1$sal$hash-sintetico';

  it('vale só para o e-mail assinado (normalizado) e a senha atual, e devolve o nonce', () => {
    const v = signKnownDevice(secret, 'Pessoa@Exemplo.test', H);
    expect(verifyKnownDevice(secret, v, ' pessoa@exemplo.test ', H)).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(verifyKnownDevice(secret, v, 'outra@exemplo.test', H)).toBeNull();
    expect(verifyKnownDevice(randomBytes(32), v, 'pessoa@exemplo.test', H)).toBeNull();
    // Senha trocada ou conta inexistente: inválido (revisão B4).
    expect(verifyKnownDevice(secret, v, 'pessoa@exemplo.test', `${H}-nova`)).toBeNull();
    expect(verifyKnownDevice(secret, v, 'pessoa@exemplo.test', null)).toBeNull();
  });

  it('não contém o e-mail nem o hash e recusa formato inválido', () => {
    const v = signKnownDevice(secret, 'pessoa@exemplo.test', H);
    expect(v).not.toContain('pessoa');
    expect(v).not.toContain('argon2');
    for (const bad of [undefined, '', 'v1.x.y', `${v}x`, v.replace('v1', 'v2')]) {
      expect(verifyKnownDevice(secret, bad, 'pessoa@exemplo.test', H)).toBeNull();
    }
  });

  it('cada emissão tem nonce próprio', () => {
    expect(signKnownDevice(secret, 'a@b.test', H)).not.toBe(signKnownDevice(secret, 'a@b.test', H));
  });
});
