import { createHash } from 'node:crypto';
import type pg from 'pg';
import { MemoryJobQueue } from '@/adapters/jobs/memory';
import { AUTH_PURGE_INTERVAL_MS, registerAuthJobs, scheduleAuthPurge } from '@/modules/auth/jobs';
import type { Db } from '@/lib/db/client';
import { withUserOn } from '@/lib/db/rls';
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

async function enableMfa(t: TestAuth) {
  const u = await createVerifiedUser(t);
  const s = await t.service.resolveSession(u.token);
  const setup = await t.service.startTotpSetup(u.userId, PASSWORD);
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

describe('MFA: TOTP e códigos de recuperação (LEG-S04)', () => {
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
      // Zera só as janelas de 15 min (limites de login); a de 1 h do MFA por conta continua.
      if (i % 4 === 3) {
        await admin.query(
          "DELETE FROM rate_limit_buckets WHERE expires_at - window_start = interval '15 minutes'",
        );
      }
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

describe('endurecimento pós-revisão (ADR-0017)', () => {
  it('ativar MFA exige a senha atual', async () => {
    const t = createTestAuth(db);
    const u = await createVerifiedUser(t);
    expect(await t.service.startTotpSetup(u.userId, 'senha errada sintética')).toEqual({
      ok: false,
    });
    const ok = await t.service.startTotpSetup(u.userId, PASSWORD);
    expect(ok.ok).toBe(true);
    expect(ok).not.toHaveProperty('uri');
  });

  it('reautenticação tem limite por usuário', async () => {
    const t = createTestAuth(db);
    const u = await createVerifiedUser(t);
    for (let i = 0; i < 10; i++) {
      await t.service.startTotpSetup(u.userId, 'senha errada sintética');
    }
    // 11ª tentativa bloqueada mesmo com a senha certa.
    expect(await t.service.startTotpSetup(u.userId, PASSWORD)).toEqual({ ok: false });
  });

  it('MFA ligado e senha trocada geram aviso de segurança ao titular', async () => {
    const t = createTestAuth(db);
    const u = await createVerifiedUser(t);
    const s = await t.service.resolveSession(u.token);
    const setup = await t.service.startTotpSetup(u.userId, PASSWORD);
    if (!setup.ok) throw new Error('setup');
    await t.service.confirmTotpSetup(
      u.userId,
      s?.sessionId ?? '',
      totpAt(base32Decode(setup.manualKey), t.clock.now.getTime()),
    );
    await t.service.changePassword(
      u.userId,
      s?.sessionId ?? '',
      PASSWORD,
      'outra senha sintética longa',
    );
    const alerts = t.mail.outbox.filter((m) => m.to === u.email && m.template === 'security-alert');
    expect(alerts.map((m) => m.params.event)).toEqual(['mfa_enabled', 'password_changed']);
  });

  it('confirmações simultâneas do TOTP geram um único conjunto de códigos', async () => {
    const t = createTestAuth(db);
    const u = await createVerifiedUser(t);
    const s = await t.service.resolveSession(u.token);
    const setup = await t.service.startTotpSetup(u.userId, PASSWORD);
    if (!setup.ok) throw new Error('setup');
    const secret = base32Decode(setup.manualKey);
    const now = t.clock.now.getTime();
    const results = await Promise.all([
      t.service.confirmTotpSetup(u.userId, s?.sessionId ?? '', totpAt(secret, now)),
      t.service.confirmTotpSetup(u.userId, s?.sessionId ?? '', totpAt(secret, now + 30_000)),
    ]);
    expect(results.filter((r) => r.ok).length).toBeLessThanOrEqual(1);
    const { rows } = await admin.query(
      'SELECT count(*)::int AS n FROM recovery_codes WHERE user_id = $1',
      [u.userId],
    );
    expect([0, 10]).toContain(rows[0].n);
  });

  it('login bloqueado responde sem calcular Argon2', async () => {
    const t = createTestAuth(db);
    const email = uniqueEmail('cpu');
    const meta = freshMeta();
    for (let i = 0; i < 5; i++) await t.service.login({ email, password: 'x'.repeat(12) }, meta);
    const start = performance.now();
    const r = await t.service.login({ email, password: 'x'.repeat(12) }, meta);
    expect(r.ok).toBe(false);
    expect(performance.now() - start).toBeLessThan(15);
  });

  it('expurgo remove sessões, tokens e janelas vencidas e mantém o que vale', async () => {
    const t = createTestAuth(db);
    const u = await createVerifiedUser(t);
    const other = await t.service.login({ email: u.email, password: PASSWORD }, freshMeta());
    if (!other.ok) throw new Error('login');
    const s = await t.service.resolveSession(other.token);
    await t.service.revokeSession(u.userId, s?.sessionId ?? '');
    await admin.query(`UPDATE sessions SET revoked_at = now() - interval '2 days' WHERE id = $1`, [
      s?.sessionId,
    ]);
    await t.service.requestPasswordReset(u.email, freshMeta());
    await admin.query(
      `UPDATE auth_tokens SET expires_at = now() - interval '2 days' WHERE user_id = $1`,
      [u.userId],
    );
    // PR1a-R2-B7: janela encerrada há menos de 5 min fica (folga para diferença de relógio).
    const { rows: buckets } = await admin.query<{ key_hash: Buffer }>(
      'SELECT key_hash FROM rate_limit_buckets',
    );
    expect(buckets.length).toBeGreaterThanOrEqual(2);
    await admin.query(`UPDATE rate_limit_buckets SET expires_at = now() - interval '6 minutes'`);
    await admin.query(
      `UPDATE rate_limit_buckets SET expires_at = now() - interval '1 minute' WHERE key_hash = $1`,
      [buckets[0]?.key_hash],
    );

    const r = await t.service.purgeExpired();
    expect(r.sessions).toBeGreaterThanOrEqual(1);
    expect(r.tokens).toBeGreaterThanOrEqual(1);
    expect(r.buckets).toBeGreaterThanOrEqual(1);
    expect(await t.service.resolveSession(u.token)).not.toBeNull();
    const left = await admin.query<{ old: number; recent: number }>(
      `SELECT count(*) FILTER (WHERE expires_at <= now() - interval '5 minutes')::int AS old,
              count(*) FILTER (WHERE expires_at > now() - interval '5 minutes')::int AS recent
         FROM rate_limit_buckets`,
    );
    expect(left.rows[0]).toEqual({ old: 0, recent: 1 });
  });

  it('runtime não altera colunas imutáveis de users', async () => {
    const t = createTestAuth(db);
    const u = await createVerifiedUser(t);
    await expect(
      withUserOn(db, u.userId, (tx) =>
        tx.user.update({ where: { id: u.userId }, data: { email: 'outro@exemplo.test' } }),
      ),
    ).rejects.toThrow();
    await expect(
      withUserOn(db, u.userId, (tx) =>
        tx.user.update({ where: { id: u.userId }, data: { adultAttestedAt: new Date(0) } }),
      ),
    ).rejects.toThrow();
  });
});

describe('pedido da Fase 1a: achados médios com teste cada (ADR-0017)', () => {
  it('bloqueio do 2º fator por conta avisa o titular por e-mail uma única vez', async () => {
    const t = createTestAuth(db);
    const u = await enableMfa(t);
    const alerts = () =>
      t.mail.outbox.filter(
        (m) => m.template === 'security-alert' && m.params.event === 'mfa_locked',
      );
    for (let i = 0; i < 12; i++) {
      const p = await pendingLogin(t, u.email);
      await t.service.verifyMfa(p, '000000', META);
      if (i % 4 === 3) {
        await admin.query(
          "DELETE FROM rate_limit_buckets WHERE expires_at - window_start = interval '15 minutes'",
        );
      }
    }
    expect(alerts()).toHaveLength(1);
    expect(alerts()[0]?.to).toBe(u.email);
  });

  it('códigos de recuperação errados contam no mesmo limite da conta', async () => {
    const t = createTestAuth(db);
    const u = await enableMfa(t);
    for (let i = 0; i < 10; i++) {
      const p = await pendingLogin(t, u.email);
      expect((await t.service.verifyMfa(p, 'aaaaa-bbbbb', META)).ok).toBe(false);
      if (i % 4 === 3) {
        await admin.query(
          "DELETE FROM rate_limit_buckets WHERE expires_at - window_start = interval '15 minutes'",
        );
      }
    }
    // Mesmo um código de recuperação válido é recusado durante o bloqueio temporário.
    const p = await pendingLogin(t, u.email);
    expect(await t.service.verifyMfa(p, u.codes[0] ?? '', META)).toEqual({
      ok: false,
      error: 'locked',
    });
  });

  it('recuperação e reenvio respondem no mesmo tempo com ou sem conta (e-mail lento)', async () => {
    const deferred: Array<Promise<void>> = [];
    const base = createTestAuth(db);
    const u = await createVerifiedUser(base);
    const pending = await createVerifiedUser(base);
    await admin.query('UPDATE users SET email_verified_at = NULL WHERE id = $1', [pending.userId]);
    const t = createTestAuth(db, { mailDelayMs: 300, deferred });
    const time = async (fn: () => Promise<void>) => {
      const start = performance.now();
      await fn();
      return performance.now() - start;
    };
    const existing = await time(() => t.service.requestPasswordReset(u.email, freshMeta()));
    const missing = await time(() =>
      t.service.requestPasswordReset(uniqueEmail('nada'), freshMeta()),
    );
    const resendPending = await time(() =>
      t.service.resendVerification(pending.email, freshMeta()),
    );
    const resendMissing = await time(() =>
      t.service.resendVerification(uniqueEmail('nada'), freshMeta()),
    );
    for (const ms of [existing, missing, resendPending, resendMissing])
      expect(ms).toBeLessThan(150);
    // O trabalho real acontece depois da resposta.
    await Promise.all(deferred);
    expect(t.mail.outbox.map((m) => [m.to, m.template])).toEqual([
      [u.email, 'password-reset'],
      [pending.email, 'email-verification'],
    ]);
  });

  it('desativar o MFA exige reautenticação por senha, com limite de Argon2 por conta', async () => {
    const t = createTestAuth(db);
    const u = await enableMfa(t);
    t.clock.now = new Date(t.clock.now.getTime() + 60_000);
    const code = totpAt(u.secret, t.clock.now.getTime());
    for (let i = 0; i < 10; i++) {
      expect(await t.service.disableMfa(u.userId, 'senha errada sintética', code)).toBe(false);
    }
    // 11ª: bloqueado antes do Argon2, mesmo com senha e código certos.
    expect(await t.service.disableMfa(u.userId, PASSWORD, code)).toBe(false);
  });

  it('job de expurgo roda pela fila, apaga o vencido e se reagenda', async () => {
    const t = createTestAuth(db);
    const u = await createVerifiedUser(t);
    const other = await t.service.login({ email: u.email, password: PASSWORD }, freshMeta());
    if (!other.ok) throw new Error('login');
    await admin.query(
      `UPDATE sessions SET revoked_at = now() - interval '2 days'
        WHERE user_id = $1 AND token_hash <> $2`,
      [u.userId, createHash('sha256').update(u.token).digest()],
    );
    const queue = new MemoryJobQueue();
    const start = new Date();
    let clock = start;
    registerAuthJobs(queue, t.service, () => clock);
    const first = await scheduleAuthPurge(queue, start);
    expect(await queue.drain(start)).toBe(1);
    expect(queue.statusOf(first)).toBe('done');
    const { rows } = await admin.query(
      'SELECT count(*)::int AS n FROM sessions WHERE user_id = $1',
      [u.userId],
    );
    expect(rows[0].n).toBe(1);
    expect(await t.service.resolveSession(u.token)).not.toBeNull();
    // Reagendado para daqui a 6 h.
    clock = new Date(start.getTime() + 60_000);
    expect(await queue.drain(clock)).toBe(0);
    clock = new Date(start.getTime() + AUTH_PURGE_INTERVAL_MS);
    expect(await queue.drain(clock)).toBe(1);
  });
});

describe('segunda revisão: médios M1–M3 (ADR-0018)', () => {
  it('M1: expurgo apaga conta nunca verificada após 7 dias e segredo TOTP abandonado após 1 dia', async () => {
    const t = createTestAuth(db);
    const verified = await createVerifiedUser(t);
    const stale = uniqueEmail('nunca-verificou');
    const fresh = uniqueEmail('recente');
    const cookie = (await t.service.checkAge('1990-01-01', new Headers())) as { cookie: string };
    await t.service.register(
      { email: stale, password: PASSWORD, ageOkCookie: cookie.cookie },
      freshMeta(),
    );
    await t.service.register(
      { email: fresh, password: PASSWORD, ageOkCookie: cookie.cookie },
      freshMeta(),
    );
    await admin.query(`UPDATE users SET created_at = now() - interval '8 days' WHERE email = $1`, [
      stale,
    ]);
    // Conta verificada antiga não é afetada.
    await admin.query(`UPDATE users SET created_at = now() - interval '30 days' WHERE id = $1`, [
      verified.userId,
    ]);
    const setup = await t.service.startTotpSetup(verified.userId, PASSWORD);
    expect(setup.ok).toBe(true);
    await admin.query(
      `UPDATE users SET totp_setup_started_at = now() - interval '2 days' WHERE id = $1`,
      [verified.userId],
    );

    const r = await t.service.purgeExpired();
    expect(r.unverified_users).toBeGreaterThanOrEqual(1);
    expect(r.pending_totp).toBeGreaterThanOrEqual(1);
    const emails = await admin.query('SELECT email FROM users WHERE email = ANY($1)', [
      [stale, fresh, verified.email],
    ]);
    expect(emails.rows.map((x: { email: string }) => x.email).sort()).toEqual(
      [fresh, verified.email].sort(),
    );
    const u = await admin.query('SELECT totp_secret FROM users WHERE id = $1', [verified.userId]);
    expect(u.rows[0].totp_secret).toBeNull();
  });

  it('M2: confirmação da ativação do TOTP tem limite por conta e o segredo pendente expira', async () => {
    const t = createTestAuth(db);
    const u = await createVerifiedUser(t);
    const s = await t.service.resolveSession(u.token);
    const setup = await t.service.startTotpSetup(u.userId, PASSWORD);
    if (!setup.ok) throw new Error('setup');
    const secret = base32Decode(setup.manualKey);
    for (let i = 0; i < 10; i++) {
      expect((await t.service.confirmTotpSetup(u.userId, s?.sessionId ?? '', '000000')).ok).toBe(
        false,
      );
    }
    // 11ª: recusada mesmo com o código certo, com erro próprio e sem aviso por e-mail: a pessoa ainda não
    // tem MFA (PR1a-R3-B6).
    const right = totpAt(secret, t.clock.now.getTime());
    expect(await t.service.confirmTotpSetup(u.userId, s?.sessionId ?? '', right)).toEqual({
      ok: false,
      error: 'locked',
    });
    expect(t.mail.outbox.some((m) => m.template === 'security-alert')).toBe(false);

    // Segredo pendente expira em 15 min.
    const t2 = createTestAuth(db);
    const v = await createVerifiedUser(t2);
    const s2 = await t2.service.resolveSession(v.token);
    const setup2 = await t2.service.startTotpSetup(v.userId, PASSWORD);
    if (!setup2.ok) throw new Error('setup');
    t2.clock.now = new Date(t2.clock.now.getTime() + 16 * 60 * 1000);
    const late = totpAt(base32Decode(setup2.manualKey), t2.clock.now.getTime());
    expect(await t2.service.confirmTotpSetup(v.userId, s2?.sessionId ?? '', late)).toEqual({
      ok: false,
      error: 'setup_expired',
    });
    // O segredo vencido sai na hora (PR1a-R3-B7).
    const user = await withUserOn(db, v.userId, (tx) =>
      tx.user.findUniqueOrThrow({ where: { id: v.userId }, select: { totpSecret: true } }),
    );
    expect(user.totpSecret).toBeNull();
  });

  it('M3: e-mails de cadastro e de verificação têm limite por destinatário, mesmo com IPs diferentes', async () => {
    const t = createTestAuth(db);
    const existing = await createVerifiedUser(t);
    const cookie = (await t.service.checkAge('1990-01-01', new Headers())) as { cookie: string };
    for (let i = 0; i < 6; i++) {
      const r = await t.service.register(
        { email: existing.email, password: PASSWORD, ageOkCookie: cookie.cookie },
        freshMeta(),
      );
      expect(r).toEqual({ ok: true }); // resposta não muda com o bloqueio
    }
    const notices = t.mail.outbox.filter(
      (m) => m.to === existing.email && m.template === 'account-exists',
    );
    // 3 por hora por destinatário, contando o cadastro original da conta: 2 avisos.
    expect(notices).toHaveLength(2);

    const pendingEmail = uniqueEmail('pendente');
    await t.service.register(
      { email: pendingEmail, password: PASSWORD, ageOkCookie: cookie.cookie },
      freshMeta(),
    );
    for (let i = 0; i < 6; i++) await t.service.resendVerification(pendingEmail, freshMeta());
    const verifications = t.mail.outbox.filter(
      (m) => m.to === pendingEmail && m.template === 'email-verification',
    );
    // 1 do cadastro + 3 reenvios por hora.
    expect(verifications).toHaveLength(4);
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
    const setup = await t.service.startTotpSetup(u.userId, NEW);
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
