import type pg from 'pg';
import type { Db } from '@/lib/db/client';
import { normalizeRecoveryCode } from '@/modules/auth/recovery';
import { base32Decode, totpAt } from '@/modules/auth/totp';
import {
  META,
  PASSWORD,
  connectAdmin,
  createTestAuth,
  createVerifiedUser,
  lastMailToken,
  runtimeDb,
  truncateAll,
  uniqueEmail,
  type TestAuth,
} from './helpers';

let admin: pg.Client;
let db: Db;

beforeAll(async () => {
  admin = await connectAdmin();
  await truncateAll(admin);
  db = runtimeDb();
});

afterAll(async () => {
  await db.$disconnect();
  await admin.end();
});

let ipSeq = 0;
/** IP novo por teste, para os limites por IP de um teste não afetarem outro. */
const freshMeta = () => ({ ...META, ip: `10.20.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}` });

async function adultCookie(t: TestAuth): Promise<string> {
  const r = await t.service.checkAge('1985-01-15', new Headers());
  if (r.outcome !== 'adult') throw new Error('age');
  return r.cookie;
}

describe('sessões em banco (LEG-S04)', () => {
  it('revogar uma sessão derruba o acesso na próxima requisição', async () => {
    const t = createTestAuth(db);
    const u = await createVerifiedUser(t);
    const s = await t.service.resolveSession(u.token);
    expect(s?.userId).toBe(u.userId);

    expect(await t.service.revokeSession(u.userId, s?.sessionId ?? '')).toBe(true);
    expect(await t.service.resolveSession(u.token)).toBeNull();
  });

  it('"sair das outras" mantém a atual e derruba as demais', async () => {
    const t = createTestAuth(db);
    const u = await createVerifiedUser(t);
    const other = await t.service.login({ email: u.email, password: PASSWORD }, freshMeta());
    if (!other.ok) throw new Error('login');
    const current = await t.service.resolveSession(u.token);
    expect((await t.service.listSessions(u.userId, current?.sessionId ?? '')).length).toBe(2);

    await t.service.revokeOtherSessions(u.userId, current?.sessionId ?? '');
    expect(await t.service.resolveSession(u.token)).not.toBeNull();
    expect(await t.service.resolveSession(other.token)).toBeNull();
    const list = await t.service.listSessions(u.userId, current?.sessionId ?? '');
    expect(list).toEqual([
      expect.objectContaining({ current: true, deviceLabel: 'Chrome · Windows' }),
    ]);
  });

  it('logout, sessão expirada (absoluta e ociosa) e conta excluída não resolvem', async () => {
    const t = createTestAuth(db);
    const u = await createVerifiedUser(t);
    const s2 = await t.service.login({ email: u.email, password: PASSWORD }, freshMeta());
    const s3 = await t.service.login({ email: u.email, password: PASSWORD }, freshMeta());
    if (!s2.ok || !s3.ok) throw new Error('login');

    await t.service.logout(u.token);
    expect(await t.service.resolveSession(u.token)).toBeNull();

    const r2 = await t.service.resolveSession(s2.token);
    await admin.query(
      `UPDATE sessions SET idle_expires_at = now() - interval '1 s' WHERE id = $1`,
      [r2?.sessionId],
    );
    expect(await t.service.resolveSession(s2.token)).toBeNull();

    await admin.query('UPDATE users SET deleted_at = now() WHERE id = $1', [u.userId]);
    expect(await t.service.resolveSession(s3.token)).toBeNull();
  });

  it('o banco guarda só o hash do token', async () => {
    const t = createTestAuth(db);
    const u = await createVerifiedUser(t);
    const { rows } = await admin.query<{ h: Buffer }>(
      'SELECT token_hash AS h FROM sessions WHERE user_id = $1',
      [u.userId],
    );
    for (const r of rows) {
      expect(r.h.length).toBe(32);
      expect(r.h.toString('base64url')).not.toBe(u.token);
    }
  });

  it('tokens malformados não chegam ao banco e não resolvem', async () => {
    const t = createTestAuth(db);
    for (const bad of [undefined, '', 'x', "' OR 1=1 --", 'a'.repeat(500)]) {
      expect(await t.service.resolveSession(bad)).toBeNull();
    }
  });
});

describe('enumeração de e-mail (ADR-0014)', () => {
  it('login: e-mail inexistente e senha errada têm a mesma resposta e tempo comparável', async () => {
    const t = createTestAuth(db);
    const u = await createVerifiedUser(t);
    const meta = freshMeta();
    const timeIt = async (email: string) => {
      const start = performance.now();
      const r = await t.service.login({ email, password: 'senha errada sintética' }, meta);
      return { r, ms: performance.now() - start };
    };
    const wrong = await timeIt(u.email);
    const missing = await timeIt(uniqueEmail('inexistente'));
    expect(missing.r).toEqual(wrong.r);
    expect(missing.r).toEqual({ ok: false, error: 'invalid_credentials' });
    // O caminho sem conta executa o hash falso (Argon2): não pode ser muito mais rápido.
    expect(missing.ms).toBeGreaterThan(wrong.ms * 0.4);
  });

  it('login: conta excluída responde igual a inexistente', async () => {
    const t = createTestAuth(db);
    const u = await createVerifiedUser(t);
    await admin.query('UPDATE users SET deleted_at = now() WHERE id = $1', [u.userId]);
    const r = await t.service.login({ email: u.email, password: PASSWORD }, freshMeta());
    expect(r).toEqual({ ok: false, error: 'invalid_credentials' });
  });

  it('recuperação: mesma resposta; e-mail só para quem existe', async () => {
    const t = createTestAuth(db);
    const u = await createVerifiedUser(t);
    const missing = uniqueEmail('inexistente');
    const meta = freshMeta();
    const before = t.mail.outbox.length;
    await expect(t.service.requestPasswordReset(u.email, meta)).resolves.toBeUndefined();
    await expect(t.service.requestPasswordReset(missing, meta)).resolves.toBeUndefined();
    const sent = t.mail.outbox.slice(before);
    expect(sent.map((m) => [m.to, m.template])).toEqual([[u.email, 'password-reset']]);
  });

  it('cadastro: e-mail novo e já existente têm resposta idêntica; nenhuma conta duplicada', async () => {
    const t = createTestAuth(db);
    const u = await createVerifiedUser(t);
    const fresh = uniqueEmail('nova');
    const cookie = await adultCookie(t);
    const before = t.mail.outbox.length;

    const rNew = await t.service.register(
      { email: fresh, password: PASSWORD, ageOkCookie: cookie },
      freshMeta(),
    );
    const rDup = await t.service.register(
      {
        email: u.email.toUpperCase(),
        password: 'outra senha sintética longa',
        ageOkCookie: cookie,
      },
      freshMeta(),
    );
    expect(rDup).toEqual(rNew);
    expect(rNew).toEqual({ ok: true });

    const sent = t.mail.outbox.slice(before).map((m) => [m.to, m.template]);
    expect(sent).toEqual([
      [fresh, 'email-verification'],
      [u.email, 'account-exists'],
    ]);
    const { rows } = await admin.query('SELECT count(*)::int AS n FROM users WHERE email = $1', [
      u.email,
    ]);
    expect(rows[0].n).toBe(1);
    // A senha da conta existente não mudou.
    expect((await t.service.login({ email: u.email, password: PASSWORD }, freshMeta())).ok).toBe(
      true,
    );
  });

  it('reenvio de verificação: resposta sempre igual', async () => {
    const t = createTestAuth(db);
    const meta = freshMeta();
    await expect(t.service.resendVerification(uniqueEmail('x'), meta)).resolves.toBeUndefined();
  });
});

describe('bloqueio por tentativas (LEG-S04/S05)', () => {
  it('6ª tentativa na mesma conta em 15 min é bloqueada mesmo com a senha certa', async () => {
    const t = createTestAuth(db);
    const u = await createVerifiedUser(t); // 1 tentativa (login do helper)
    for (let i = 0; i < 4; i++) {
      const r = await t.service.login(
        { email: u.email, password: 'errada sintética' },
        freshMeta(),
      );
      expect(r.ok).toBe(false);
    }
    const blocked = await t.service.login({ email: u.email, password: PASSWORD }, freshMeta());
    expect(blocked).toEqual({ ok: false, error: 'invalid_credentials' });

    // Variação de maiúsculas/espaços não contorna o limite (e-mail normalizado).
    const variant = await t.service.login(
      { email: `  ${u.email.toUpperCase()} `, password: PASSWORD },
      freshMeta(),
    );
    expect(variant.ok).toBe(false);

    // Janela expira (relógio simulado).
    t.clock.now = new Date(t.clock.now.getTime() + 16 * 60 * 1000);
    const later = await t.service.login({ email: u.email, password: PASSWORD }, freshMeta());
    expect(later.ok).toBe(true);
  });

  it('limite por IP vale entre contas diferentes', async () => {
    const t = createTestAuth(db);
    const u = await createVerifiedUser(t);
    const meta = freshMeta();
    for (let i = 0; i < 20; i++) {
      await t.service.login({ email: uniqueEmail('tentativa'), password: 'x'.repeat(12) }, meta);
    }
    const r = await t.service.login({ email: u.email, password: PASSWORD }, meta);
    expect(r).toEqual({ ok: false, error: 'invalid_credentials' });
    expect((await t.service.login({ email: u.email, password: PASSWORD }, freshMeta())).ok).toBe(
      true,
    );
  });

  it('cadastro e pedido de redefinição têm limite por IP', async () => {
    const t = createTestAuth(db);
    const cookie = await adultCookie(t);
    const meta = freshMeta();
    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(
        await t.service.register(
          { email: uniqueEmail('lote'), password: PASSWORD, ageOkCookie: cookie },
          meta,
        ),
      );
    }
    expect(results.slice(0, 5).every((r) => r.ok)).toBe(true);
    expect(results[5]).toEqual({ ok: false, error: 'rate_limited' });

    const u = await createVerifiedUser(t);
    const before = t.mail.outbox.length;
    const resetMeta = freshMeta();
    for (let i = 0; i < 5; i++) await t.service.requestPasswordReset(u.email, resetMeta);
    // Por conta: no máximo 3 e-mails por hora, mesmo com IPs diferentes.
    await t.service.requestPasswordReset(u.email, freshMeta());
    expect(t.mail.outbox.slice(before).filter((m) => m.template === 'password-reset')).toHaveLength(
      3,
    );
  });
});

describe('redefinição de senha (LEG-S04)', () => {
  async function requestToken(t: TestAuth, email: string) {
    await t.service.requestPasswordReset(email, freshMeta());
    return lastMailToken(t, email, 'password-reset');
  }

  it('troca a senha, revoga todas as sessões e o token só funciona uma vez', async () => {
    const t = createTestAuth(db);
    const u = await createVerifiedUser(t);
    const token = await requestToken(t, u.email);
    const NEW = 'nova senha sintética bem longa';

    expect(await t.service.resetPassword(token, NEW)).toEqual({ ok: true });
    expect(await t.service.resolveSession(u.token)).toBeNull();
    expect(await t.service.resetPassword(token, 'mais uma senha sintética')).toEqual({
      ok: false,
      error: 'invalid_token',
    });
    expect((await t.service.login({ email: u.email, password: PASSWORD }, freshMeta())).ok).toBe(
      false,
    );
    expect((await t.service.login({ email: u.email, password: NEW }, freshMeta())).ok).toBe(true);
  });

  it('token expirado, de outra finalidade, anterior a um novo pedido ou malformado falha', async () => {
    const t = createTestAuth(db);
    const u = await createVerifiedUser(t);

    const expired = await requestToken(t, u.email);
    await admin.query(
      `UPDATE auth_tokens SET expires_at = now() - interval '1 s'
        WHERE user_id = $1 AND purpose = 'reset_password' AND used_at IS NULL`,
      [u.userId],
    );
    expect((await t.service.resetPassword(expired, 'senha sintética nova 1')).ok).toBe(false);

    const old = await requestToken(t, u.email);
    const fresh = await requestToken(t, u.email);
    expect((await t.service.resetPassword(old, 'senha sintética nova 2')).ok).toBe(false);

    // Token de verificação de e-mail não serve para redefinir.
    const t2 = createTestAuth(db);
    const email = uniqueEmail('verif');
    await t2.service.register(
      { email, password: PASSWORD, ageOkCookie: await adultCookie(t2) },
      freshMeta(),
    );
    const verifyToken = lastMailToken(t2, email, 'email-verification');
    expect((await t2.service.resetPassword(verifyToken, 'senha sintética nova 3')).ok).toBe(false);

    expect((await t.service.resetPassword('nao-e-token', 'senha sintética nova 4')).ok).toBe(false);
    expect(await t.service.resetPassword(fresh, 'curta')).toEqual({
      ok: false,
      error: 'weak_password',
      problem: 'too_short',
    });
    // Senha fraca não consome o token.
    expect((await t.service.resetPassword(fresh, 'senha sintética nova 5')).ok).toBe(true);
  });

  it('o banco guarda só o hash dos tokens', async () => {
    const t = createTestAuth(db);
    const u = await createVerifiedUser(t);
    const token = await requestToken(t, u.email);
    const { rows } = await admin.query<{ h: Buffer }>(
      'SELECT token_hash AS h FROM auth_tokens WHERE user_id = $1',
      [u.userId],
    );
    expect(rows.every((r) => r.h.toString('base64url') !== token && r.h.length === 32)).toBe(true);
  });
});

describe('MFA: TOTP e códigos de recuperação (LEG-S04)', () => {
  async function enableMfa(t: TestAuth) {
    const u = await createVerifiedUser(t);
    const s = await t.service.resolveSession(u.token);
    const setup = await t.service.startTotpSetup(u.userId);
    if (!setup.ok) throw new Error('setup');
    const secret = base32Decode(setup.manualKey);
    const confirm = await t.service.confirmTotpSetup(
      u.userId,
      s?.sessionId ?? '',
      totpAt(secret, t.clock.now.getTime()),
    );
    if (!confirm.ok) throw new Error('confirm');
    return { ...u, secret, codes: confirm.recoveryCodes, setup };
  }

  async function pendingLogin(t: TestAuth, email: string) {
    const r = await t.service.login({ email, password: PASSWORD }, freshMeta());
    if (!r.ok || !r.mfaRequired) throw new Error('esperava MFA');
    return r.token;
  }

  it('login com MFA cria sessão pendente que não dá acesso; o código troca a sessão', async () => {
    const t = createTestAuth(db);
    const u = await enableMfa(t);
    expect(u.setup.qrSvg.startsWith('<svg')).toBe(true);
    const pending = await pendingLogin(t, u.email);
    expect((await t.service.resolveSession(pending))?.mfaPending).toBe(true);

    t.clock.now = new Date(t.clock.now.getTime() + 30_000);
    const r = await t.service.verifyMfa(pending, totpAt(u.secret, t.clock.now.getTime()), META);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.token).not.toBe(pending);
    expect(await t.service.resolveSession(pending)).toBeNull();
    expect((await t.service.resolveSession(r.token))?.mfaPending).toBe(false);
  });

  it('o mesmo código TOTP não é aceito duas vezes, nem em paralelo, nem de passo anterior', async () => {
    const t = createTestAuth(db);
    const u = await enableMfa(t);
    t.clock.now = new Date(t.clock.now.getTime() + 60_000);
    const code = totpAt(u.secret, t.clock.now.getTime());

    const [p1, p2] = [await pendingLogin(t, u.email), await pendingLogin(t, u.email)];
    const results = await Promise.all([
      t.service.verifyMfa(p1, code, META),
      t.service.verifyMfa(p2, code, META),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);

    const p3 = await pendingLogin(t, u.email);
    expect(await t.service.verifyMfa(p3, code, META)).toEqual({ ok: false, error: 'invalid_code' });
    const previous = totpAt(u.secret, t.clock.now.getTime() - 30_000);
    expect(await t.service.verifyMfa(p3, previous, META)).toEqual({
      ok: false,
      error: 'invalid_code',
    });
  });

  it('código de recuperação funciona uma vez e o banco só tem hashes', async () => {
    const t = createTestAuth(db);
    const u = await enableMfa(t);
    const [code = ''] = u.codes;

    const p1 = await pendingLogin(t, u.email);
    expect((await t.service.verifyMfa(p1, code.toUpperCase(), META)).ok).toBe(true);
    const p2 = await pendingLogin(t, u.email);
    expect(await t.service.verifyMfa(p2, code, META)).toEqual({ ok: false, error: 'invalid_code' });

    const { rows } = await admin.query<{ h: Buffer }>(
      'SELECT code_hash AS h FROM recovery_codes WHERE user_id = $1',
      [u.userId],
    );
    expect(rows).toHaveLength(10);
    const dump = rows.map((r) => `${r.h.toString('hex')}${r.h.toString('latin1')}`).join('');
    for (const c of u.codes) {
      expect(dump).not.toContain(c);
      expect(dump).not.toContain(normalizeRecoveryCode(c));
    }
  });

  it('5 erros revogam a sessão pendente (6ª tentativa bloqueada mesmo com código certo)', async () => {
    const t = createTestAuth(db);
    const u = await enableMfa(t);
    const pending = await pendingLogin(t, u.email);
    for (let i = 0; i < 5; i++) {
      expect((await t.service.verifyMfa(pending, '000000', META)).ok).toBe(false);
    }
    t.clock.now = new Date(t.clock.now.getTime() + 90_000);
    const r = await t.service.verifyMfa(pending, totpAt(u.secret, t.clock.now.getTime()), META);
    expect(r).toEqual({ ok: false, error: 'locked' });
    expect(await t.service.resolveSession(pending)).toBeNull();
  });

  it('limite por conta: novas sessões pendentes não renovam as tentativas de TOTP', async () => {
    const t = createTestAuth(db);
    const u = await enableMfa(t);
    // 10 erros por hora por conta, espalhados em várias sessões pendentes.
    for (let i = 0; i < 10; i++) {
      const p = await pendingLogin(t, u.email);
      expect((await t.service.verifyMfa(p, '000000', META)).ok).toBe(false);
      if (i % 4 === 3) t.clock.now = new Date(t.clock.now.getTime() + 16 * 60 * 1000);
    }
    t.clock.now = new Date(t.clock.now.getTime() + 60_000);
    const p = await pendingLogin(t, u.email);
    const r = await t.service.verifyMfa(p, totpAt(u.secret, t.clock.now.getTime()), META);
    expect(r).toEqual({ ok: false, error: 'locked' });
  });

  it('o segredo TOTP fica cifrado e regenerar códigos invalida os anteriores', async () => {
    const t = createTestAuth(db);
    const u = await enableMfa(t);
    const { rows } = await admin.query<{ s: Buffer }>(
      'SELECT totp_secret AS s FROM users WHERE id = $1',
      [u.userId],
    );
    expect(rows[0]?.s.includes(u.secret)).toBe(false);
    expect(rows[0]?.s[0]).toBe(0x01);

    const regen = await t.service.regenerateRecoveryCodes(u.userId, PASSWORD);
    if (!regen.ok) throw new Error('regen');
    const pending = await pendingLogin(t, u.email);
    expect((await t.service.verifyMfa(pending, u.codes[1] ?? '', META)).ok).toBe(false);
    expect((await t.service.verifyMfa(pending, regen.recoveryCodes[0] ?? '', META)).ok).toBe(true);
    expect((await t.service.regenerateRecoveryCodes(u.userId, 'senha errada sintética')).ok).toBe(
      false,
    );
  });

  it('desativar exige senha e código', async () => {
    const t = createTestAuth(db);
    const u = await enableMfa(t);
    t.clock.now = new Date(t.clock.now.getTime() + 60_000);
    const code = totpAt(u.secret, t.clock.now.getTime());
    expect(await t.service.disableMfa(u.userId, 'senha errada sintética', code)).toBe(false);
    expect(await t.service.disableMfa(u.userId, PASSWORD, '123456')).toBe(false);
    expect(await t.service.disableMfa(u.userId, PASSWORD, code)).toBe(true);
    const r = await t.service.login({ email: u.email, password: PASSWORD }, freshMeta());
    expect(r.ok && r.mfaRequired).toBe(false);
  });
});

describe('logs sem dado sensível (LEG-R04)', () => {
  it('fluxos completos não registram e-mail, senha, token, código ou data', async () => {
    const t = createTestAuth(db);
    const email = uniqueEmail('log');
    const u = await createVerifiedUser(t, email);
    await t.service.login({ email, password: 'senha errada sintética' }, freshMeta());
    await t.service.requestPasswordReset(email, freshMeta());
    const reset = lastMailToken(t, email, 'password-reset');
    const NEW = 'senha sintética depois do reset';
    await t.service.resetPassword(reset, NEW);
    const login = await t.service.login({ email, password: NEW }, freshMeta());
    if (!login.ok) throw new Error('login');
    const s = await t.service.resolveSession(login.token);
    const setup = await t.service.startTotpSetup(u.userId);
    if (!setup.ok) throw new Error('setup');
    const totp = totpAt(base32Decode(setup.manualKey), t.clock.now.getTime());
    const confirm = await t.service.confirmTotpSetup(u.userId, s?.sessionId ?? '', totp);
    if (!confirm.ok) throw new Error('confirm');

    const dump = JSON.stringify(t.logs);
    expect(t.logs.length).toBeGreaterThan(5);
    const forbidden = [
      email,
      email.split('@')[0] ?? email,
      PASSWORD,
      NEW,
      'senha errada sintética',
      reset,
      u.token,
      login.token,
      totp,
      setup.manualKey.replace(/\s/g, ''),
      ...confirm.recoveryCodes,
      '1990-05-20',
    ];
    for (const value of forbidden) expect(dump).not.toContain(value);
  });
});
