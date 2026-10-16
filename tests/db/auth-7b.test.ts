import type pg from 'pg';
import type { Db } from '@/lib/db/client';
import { withUserOn } from '@/lib/db/rls';
import { rateLimitPeek } from '@/modules/auth/rate-limit';
import { base32Decode, totpAt } from '@/modules/auth/totp';
import {
  connectAdmin,
  createTestAuth,
  createVerifiedUser,
  lastMailToken,
  PASSWORD,
  runtimeDb,
  type TestAuth,
  truncateAll,
  uniqueEmail,
} from './helpers';

/**
 * Fase 7b (ADR-0036 D3, ADR-0037): achados de autenticação. Pepper próprio dos códigos de recuperação
 * (PR1a-B3), limite do 2º fator que conta só falhas e senha antes do código (PR1a-R2-B1/B2, P7-B2), avisos de
 * segurança (PR1a-R2-B4), teto diário de e-mails por destinatário (PR1a-R3-B1/B9), link de verificação limitado
 * ao expurgo (PR1a-R3-B2) e casos negativos do expurgo (PR1a-R3-B4). Dados 100% sintéticos.
 */
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

let ipCounter = 0;
const freshMeta = () => {
  ipCounter += 1;
  return { ip: `192.0.2.${(ipCounter % 250) + 1}`, userAgent: 'Mozilla/5.0 Firefox/140.0' };
};

async function enableMfa(t: TestAuth) {
  const u = await createVerifiedUser(t);
  const setup = await t.service.startTotpSetup(u.userId, PASSWORD);
  if (!setup.ok) throw new Error('setup');
  const secret = base32Decode(setup.manualKey);
  const confirm = await t.service.confirmTotpSetup(
    u.userId,
    '',
    totpAt(secret, t.clock.now.getTime()),
  );
  if (!confirm.ok) throw new Error('confirm');
  // Próximo passo do TOTP: o código da ativação não vale de novo (anti-replay).
  t.clock.now = new Date(t.clock.now.getTime() + 31_000);
  return { ...u, secret, codes: confirm.recoveryCodes };
}

/**
 * Relógio fixo no começo de uma hora (futura): as janelas de 15 min da reautenticação (`reauthUser`, 10 por
 * janela) viram no meio do teste, a de 1 h do 2º fator não.
 */
const HOUR_START = '2026-10-20T10:01:00Z';
const QUARTER_LATER = '2026-10-20T10:16:00Z';

const mfaFailures = (t: TestAuth, userId: string) =>
  rateLimitPeek(db, t.rateLimitSecret, 'mfaAccount', userId, t.clock.now);

describe('pepper próprio dos códigos de recuperação (PR1a-B3)', () => {
  it('girar o SESSION_SECRET não invalida os códigos; trocar o pepper, sim', async () => {
    const t = createTestAuth(db);
    const u = await enableMfa(t);
    // Mesmo pepper, outro SESSION_SECRET (createTestAuth sorteia um novo).
    const rotated = createTestAuth(db, { recoveryPepper: t.recoveryPepper });
    expect(rotated.sessionSecret).not.toEqual(t.sessionSecret);
    expect(
      await rotated.service.issueReauthProof(u.userId, PASSWORD, 'account_deletion', u.codes[0]),
    ).not.toBeNull();
    // Outro pepper: o código não confere.
    const other = createTestAuth(db);
    expect(
      await other.service.issueReauthProof(u.userId, PASSWORD, 'account_deletion', u.codes[1]),
    ).toBeNull();
  });
});

describe('limite do 2º fator por conta (PR1a-R2-B1/B2, P7-B2)', () => {
  it('senha errada não consome o limite do titular (exclusão, encerramento, desligar MFA)', async () => {
    const t = createTestAuth(db);
    const u = await enableMfa(t);
    for (let i = 0; i < 3; i++) {
      expect(
        await t.service.issueReauthProof(u.userId, 'errada', 'account_deletion', '000000'),
      ).toBeNull();
      expect(
        await t.service.issueReauthProof(u.userId, 'errada', 'minor_closure', '000000'),
      ).toBeNull();
      expect(await t.service.disableMfa(u.userId, 'errada', '000000')).toBe(false);
    }
    expect(await mfaFailures(t, u.userId)).toBe(0);
    expect(t.mail.outbox.some((m) => m.to === u.email && m.params.event === 'mfa_locked')).toBe(
      false,
    );
  });

  it('só as falhas contam: entrar certo várias vezes não bloqueia', async () => {
    const t = createTestAuth(db);
    t.clock.now = new Date(HOUR_START);
    const u = await enableMfa(t);
    for (let i = 0; i < 9; i++) {
      const code = totpAt(u.secret, t.clock.now.getTime());
      expect(
        await t.service.issueReauthProof(u.userId, PASSWORD, 'account_deletion', code),
      ).not.toBeNull();
      t.clock.now = new Date(t.clock.now.getTime() + 31_000);
    }
    expect(await mfaFailures(t, u.userId)).toBe(0);
    t.clock.now = new Date(QUARTER_LATER);
    expect(
      await t.service.issueReauthProof(u.userId, PASSWORD, 'account_deletion', '000000'),
    ).toBeNull();
    expect(await mfaFailures(t, u.userId)).toBe(1);
  });

  it('10 falhas bloqueiam até o código certo, e o titular é avisado uma vez', async () => {
    const t = createTestAuth(db);
    t.clock.now = new Date(HOUR_START);
    const u = await enableMfa(t);
    for (let i = 0; i < 10; i++) {
      if (i === 9) t.clock.now = new Date(QUARTER_LATER);
      expect(
        await t.service.issueReauthProof(u.userId, PASSWORD, 'account_deletion', '000000'),
      ).toBeNull();
    }
    expect(await mfaFailures(t, u.userId)).toBe(10);
    const right = totpAt(u.secret, t.clock.now.getTime());
    expect(
      await t.service.issueReauthProof(u.userId, PASSWORD, 'account_deletion', right),
    ).toBeNull();
    const locked = t.mail.outbox.filter((m) => m.to === u.email && m.params.event === 'mfa_locked');
    expect(locked).toHaveLength(1);
    expect(t.logs.some((l) => l.event === 'auth.mfa_account_locked')).toBe(true);
  });
});

describe('avisos de segurança (PR1a-R2-B4)', () => {
  it('redefinir a senha e gerar códigos novos avisam o titular', async () => {
    const t = createTestAuth(db);
    const u = await enableMfa(t);
    expect((await t.service.regenerateRecoveryCodes(u.userId, PASSWORD)).ok).toBe(true);
    await t.service.requestPasswordReset(u.email, freshMeta());
    const token = lastMailToken(t, u.email, 'password-reset');
    expect(await t.service.resetPassword(token, 'outra senha bem longa e nova')).toEqual({
      ok: true,
    });
    const events = t.mail.outbox
      .filter((m) => m.to === u.email && m.template === 'security-alert')
      .map((m) => m.params.event);
    expect(events).toEqual(
      expect.arrayContaining(['recovery_codes_regenerated', 'password_reset']),
    );
  });
});

describe('teto diário de e-mails por destinatário (PR1a-R3-B1, PR1a-R3-B9)', () => {
  it('cadastro e reenvio somam no máximo 10 por dia; o bloqueio vai ao log sem o e-mail', async () => {
    const t = createTestAuth(db);
    const email = uniqueEmail('assediada');
    // Começo de um dia UTC: as janelas de 1 h viram, a de 24 h não.
    t.clock.now = new Date('2026-10-20T03:30:00Z');
    for (let hour = 0; hour < 2; hour++) {
      // O cookie de idade vale 30 min no relógio do teste.
      const age = await t.service.checkAge('1990-05-20', new Headers());
      if (age.outcome !== 'adult') throw new Error('age');
      for (let i = 0; i < 3; i++) {
        await t.service.register(
          { email, password: PASSWORD, ageOkCookie: age.cookie },
          freshMeta(),
        );
        await t.service.resendVerification(email, freshMeta());
      }
      t.clock.now = new Date(t.clock.now.getTime() + 60 * 60 * 1000);
    }
    const toVictim = () => t.mail.outbox.filter((m) => m.to === email);
    expect(toVictim()).toHaveLength(10);
    const limited = t.logs.filter((l) => l.event === 'auth.mail_rate_limited');
    expect(limited.length).toBeGreaterThan(0);
    expect(JSON.stringify(limited)).not.toContain(email);
    // A redefinição não entra no teto diário (revisão M3): o titular ainda recebe o link.
    await t.service.requestPasswordReset(email, freshMeta());
    expect(toVictim().at(-1)?.template).toBe('password-reset');
  });
});

describe('link de verificação e expurgo (PR1a-R3-B2, PR1a-R3-B4)', () => {
  it('o link reenviado no 6º dia vale só até o 7º (o expurgo apaga a conta nesse prazo)', async () => {
    const t = createTestAuth(db);
    const email = uniqueEmail('naoverificada');
    const age = await t.service.checkAge('1990-05-20', new Headers());
    if (age.outcome !== 'adult') throw new Error('age');
    await t.service.register({ email, password: PASSWORD, ageOkCookie: age.cookie }, freshMeta());
    await admin.query(
      `UPDATE users SET created_at = now() - interval '6 days 20 hours' WHERE email = $1`,
      [email],
    );
    await t.service.resendVerification(email, freshMeta());
    const { rows } = await admin.query<{ left_s: number }>(
      `SELECT extract(epoch FROM t.expires_at - now())::int AS left_s
         FROM auth_tokens t JOIN users u ON u.id = t.user_id
        WHERE u.email = $1 AND t.used_at IS NULL`,
      [email],
    );
    expect(rows).toHaveLength(1);
    // ~4 h, não 24 h.
    expect(rows[0]?.left_s).toBeLessThanOrEqual(4 * 60 * 60 + 5);
  });

  it('o expurgo preserva o MFA ativo, o segredo pendente recente e a conta antiga verificada', async () => {
    const t = createTestAuth(db);
    const mfa = await enableMfa(t);
    const pendingRecent = await createVerifiedUser(t);
    const pendingOld = await createVerifiedUser(t);
    const oldVerified = await createVerifiedUser(t);
    for (const u of [pendingRecent, pendingOld]) {
      expect((await t.service.startTotpSetup(u.userId, PASSWORD)).ok).toBe(true);
    }
    await admin.query(
      `UPDATE users SET totp_setup_started_at = now() - interval '30 minutes' WHERE id = $1`,
      [pendingRecent.userId],
    );
    await admin.query(
      `UPDATE users SET totp_setup_started_at = now() - interval '2 hours' WHERE id = $1`,
      [pendingOld.userId],
    );
    // Ativado há muito tempo: o expurgo de pendentes não alcança quem já tem MFA.
    await admin.query(
      `UPDATE users SET updated_at = now() - interval '10 days', totp_setup_started_at = NULL WHERE id = $1`,
      [mfa.userId],
    );
    await admin.query(`UPDATE users SET created_at = now() - interval '60 days' WHERE id = $1`, [
      oldVerified.userId,
    ]);

    const r = await t.service.purgeExpired();
    expect(r.pending_totp).toBeGreaterThanOrEqual(1);
    const { rows } = await admin.query<{ id: string; has_secret: boolean; mfa: boolean }>(
      `SELECT id, totp_secret IS NOT NULL AS has_secret, mfa_enabled_at IS NOT NULL AS mfa
         FROM users WHERE id = ANY($1::uuid[])`,
      [[mfa.userId, pendingRecent.userId, pendingOld.userId, oldVerified.userId]],
    );
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(mfa.userId)).toMatchObject({ has_secret: true, mfa: true });
    expect(byId.get(pendingRecent.userId)?.has_secret).toBe(true);
    expect(byId.get(pendingOld.userId)?.has_secret).toBe(false);
    expect(byId.has(oldVerified.userId)).toBe(true);
  });

  it('conta não verificada após 7 dias sai com as sessões e os tokens (cascata)', async () => {
    const t = createTestAuth(db);
    const email = uniqueEmail('expirada');
    const age = await t.service.checkAge('1990-05-20', new Headers());
    if (age.outcome !== 'adult') throw new Error('age');
    await t.service.register({ email, password: PASSWORD, ageOkCookie: age.cookie }, freshMeta());
    const { rows } = await admin.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [
      email,
    ]);
    const id = rows[0]?.id ?? '';
    await admin.query(`UPDATE users SET created_at = now() - interval '8 days' WHERE id = $1`, [
      id,
    ]);
    await t.service.purgeExpired();
    for (const table of ['users', 'auth_tokens', 'sessions']) {
      const column = table === 'users' ? 'id' : 'user_id';
      const left = await admin.query(`SELECT 1 FROM ${table} WHERE ${column} = $1`, [id]);
      expect(left.rows, table).toHaveLength(0);
    }
  });
});

describe('concessões das funções novas da 7b', () => {
  it('o runtime consulta o limite e a impressão da senha; a lista de lembretes é só do app_worker', async () => {
    await expect(
      db.$queryRaw`SELECT app.rate_limit_peek(${new Uint8Array(32)}, 60::int, now())`,
    ).resolves.toBeDefined();
    const rows = await db.$queryRaw<Array<{ user_id: string; password_fingerprint: Uint8Array }>>`
      SELECT * FROM app.auth_find_reset('ninguem@exemplo.test')`;
    expect(rows).toEqual([]);
    await expect(
      db.$queryRaw`SELECT * FROM app.reminders_active(NULL::uuid, 10::int)`,
    ).rejects.toThrow(/permission denied/i);
  });
});

describe('sessões: o runtime só altera as colunas que usa (PR1a-R2-B5)', () => {
  it('revogar e renovar passam; token, dono e MFA pendente são recusados', async () => {
    const t = createTestAuth(db);
    const u = await createVerifiedUser(t);
    await withUserOn(db, u.userId, (tx) =>
      tx.session.updateMany({ where: { userId: u.userId }, data: { lastSeenAt: new Date() } }),
    );
    for (const column of ['token_hash', 'user_id', 'mfa_pending', 'expires_at']) {
      await expect(
        withUserOn(db, u.userId, (tx) =>
          tx.$executeRawUnsafe(
            `UPDATE sessions SET ${column} = ${column} WHERE user_id = $1::uuid`,
            u.userId,
          ),
        ),
        column,
      ).rejects.toThrow(/permission denied/i);
    }
  });
});
