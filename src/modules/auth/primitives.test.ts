// @vitest-environment node
import { randomBytes } from 'node:crypto';
import {
  AGE_GATE_VERSION,
  AGE_OK_TTL_SECONDS,
  ageOn,
  isAdult,
  parseBirthDate,
  signAgeOk,
  verifyAgeOk,
} from './age';
import { constantTimeEqual } from './crypto';
import { checkPasswordPolicy, hashPassword, verifyAgainstDummy, verifyPassword } from './password';
import { totpQrSvg } from './qr';
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  looksLikeRecoveryCode,
  normalizeRecoveryCode,
} from './recovery';
import { base32Decode, base32Encode, hotp, otpauthUri, totpAt, totpStep, verifyTotp } from './totp';

describe('constantTimeEqual (ADR-0014)', () => {
  it('compara iguais, diferentes e de tamanhos diferentes sem lançar', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcdef')).toBe(false);
    expect(constantTimeEqual('', '')).toBe(true);
    expect(constantTimeEqual(Buffer.from([1, 2]), new Uint8Array([1, 2]))).toBe(true);
  });
});

describe('senha (Argon2id)', () => {
  it('gera PHC argon2id com os parâmetros OWASP e verifica', async () => {
    const phc = await hashPassword('uma senha sintética longa');
    expect(phc).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verifyPassword('uma senha sintética longa', phc)).toBe(true);
    expect(await verifyPassword('outra senha sintética', phc)).toBe(false);
  });

  it('salt aleatório e formato inválido => false', async () => {
    const a = await hashPassword('mesma senha sintética');
    const b = await hashPassword('mesma senha sintética');
    expect(a).not.toBe(b);
    expect(await verifyPassword('x', 'não é phc')).toBe(false);
  });

  it('hash falso sempre retorna false', async () => {
    expect(await verifyAgainstDummy('qualquer coisa')).toBe(false);
  });

  it('política: tamanho, senhas comuns e parte do e-mail', () => {
    expect(checkPasswordPolicy('curta')).toBe('too_short');
    expect(checkPasswordPolicy('a'.repeat(129))).toBe('too_long');
    expect(checkPasswordPolicy('Password1234')).toBe('too_common');
    expect(checkPasswordPolicy('zzzzzzzzzzzzzz')).toBe('too_common');
    expect(checkPasswordPolicy('mariana-2026-xyz', 'mariana@exemplo.test')).toBe('too_common');
    expect(checkPasswordPolicy('cavalo bateria grampo')).toBeNull();
  });
});

describe('TOTP (RFC 6238)', () => {
  // Vetores do Apêndice B da RFC 6238 (SHA-1, 8 dígitos).
  const seed = Buffer.from('12345678901234567890', 'ascii');
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ])('T=%i => %s', (t, expected) => {
    expect(totpAt(seed, t * 1000, 8)).toBe(expected);
  });

  it('HOTP: vetores da RFC 4226', () => {
    expect(hotp(seed, 0)).toBe('755224');
    expect(hotp(seed, 9)).toBe('520489');
  });

  it('base32 ida e volta', () => {
    const buf = randomBytes(20);
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
  });

  it('aceita a janela ±1 e devolve o passo; recusa fora dela e malformado', () => {
    const secret = randomBytes(20);
    const now = 1_800_000_000_000;
    const step = totpStep(now);
    expect(verifyTotp(secret, totpAt(secret, now), now)).toBe(step);
    expect(verifyTotp(secret, totpAt(secret, now - 30_000), now)).toBe(step - 1);
    expect(verifyTotp(secret, totpAt(secret, now + 30_000), now)).toBe(step + 1);
    expect(verifyTotp(secret, totpAt(secret, now - 90_000), now)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', now)).toBeNull();
    expect(verifyTotp(secret, '12345', now)).toBeNull();
  });

  it('URI otpauth sem e-mail', () => {
    const uri = otpauthUri(randomBytes(20), 'Conta', 'HealthMind 360');
    expect(uri).toMatch(/^otpauth:\/\/totp\/HealthMind%20360:Conta\?secret=[A-Z2-7]+&issuer=/);
  });
});

describe('códigos de recuperação', () => {
  it('gera 10 códigos únicos no formato xxxxx-xxxxx', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/);
  });

  it('normaliza entrada e o hash não contém o código', () => {
    const pepper = randomBytes(32);
    const [code = ''] = generateRecoveryCodes(1);
    expect(normalizeRecoveryCode(` ${code.toUpperCase()} `)).toBe(code.replace('-', ''));
    expect(looksLikeRecoveryCode(code)).toBe(true);
    const h = hashRecoveryCode(pepper, code);
    expect(h.equals(hashRecoveryCode(pepper, code.toUpperCase()))).toBe(true);
    expect(h.toString('utf8')).not.toContain(code);
    expect(h.equals(hashRecoveryCode(randomBytes(32), code))).toBe(false);
  });
});

describe('age gate (LEG-F01)', () => {
  // 2026-10-06 12:00 em Brasília (15:00 UTC).
  const now = new Date('2026-10-06T15:00:00Z');

  it('18 anos completos hoje = adulto; amanhã = menor', () => {
    expect(isAdult({ year: 2008, month: 10, day: 6 }, now)).toBe(true);
    expect(isAdult({ year: 2008, month: 10, day: 7 }, now)).toBe(false);
    expect(ageOn({ year: 2009, month: 1, day: 1 }, now)).toBe(17);
  });

  it('usa o fuso de Brasília: 02:00 UTC do dia 7 ainda é dia 6 no Brasil', () => {
    const lateNight = new Date('2026-10-07T02:00:00Z');
    expect(isAdult({ year: 2008, month: 10, day: 7 }, lateNight)).toBe(false);
  });

  it('valida datas reais', () => {
    expect(parseBirthDate('2000-02-30', now)).toBeNull();
    expect(parseBirthDate('31/12/2000', now)).toBeNull();
    expect(parseBirthDate('2100-01-01', now)).toBeNull();
    expect(parseBirthDate('1850-01-01', now)).toBeNull();
    expect(parseBirthDate('2000-02-29', now)).toEqual({ year: 2000, month: 2, day: 29 });
  });

  it('cookie hm_age_ok: assinado, expira, não contém data', () => {
    const secret = randomBytes(32);
    const value = signAgeOk(secret, now);
    expect(value.startsWith(`${AGE_GATE_VERSION}.`)).toBe(true);
    expect(value).not.toMatch(/2008|1990|-\d{2}-/);
    expect(verifyAgeOk(secret, value, now)).toBe(true);
    expect(verifyAgeOk(randomBytes(32), value, now)).toBe(false);
    const later = new Date(now.getTime() + (AGE_OK_TTL_SECONDS + 1) * 1000);
    expect(verifyAgeOk(secret, value, later)).toBe(false);
    const tampered = value.replace(/\.(\d+)\./, (_, exp: string) => `.${Number(exp) + 999}.`);
    expect(verifyAgeOk(secret, tampered, now)).toBe(false);
    expect(verifyAgeOk(secret, undefined, now)).toBe(false);
  });
});

describe('QR local', () => {
  it('gera SVG sem referências externas', () => {
    const svg = totpQrSvg('otpauth://totp/HealthMind:Conta?secret=JBSWY3DPEHPK3PXP');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org\/2000\/svg)/);
    expect(svg).not.toContain('JBSWY3DPEHPK3PXP');
    expect(svg).toContain('aria-hidden="true"');
  });
});
