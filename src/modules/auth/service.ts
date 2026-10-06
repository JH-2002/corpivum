import type { AgeSignalProvider } from '@/adapters/age-signal/types';
import type { KmsProvider } from '@/adapters/kms/types';
import type { MailProvider } from '@/adapters/mail/types';
import { decryptField, encryptField } from '@/lib/crypto/field';
import type { Db } from '@/lib/db/client';
import { withUserOn, type Tx } from '@/lib/db/rls';
import type { Logger } from '@/lib/logger';
import { AGE_GATE_VERSION, isAdult, parseBirthDate, signAgeOk, verifyAgeOk } from './age';
import { randomToken, sha256 } from './crypto';
import { deviceLabel } from './device';
import {
  checkPasswordPolicy,
  hashPassword,
  verifyAgainstDummy,
  verifyPassword,
  type PasswordProblem,
} from './password';
import { totpQrSvg } from './qr';
import { MFA_MAX_ATTEMPTS, rateLimitHit, type RateLimitName } from './rate-limit';
import { generateRecoveryCodes, hashRecoveryCode, looksLikeRecoveryCode } from './recovery';
import { formatManualKey, generateTotpSecret, otpauthUri, verifyTotp } from './totp';

/**
 * Serviço de autenticação (ADR-0014; LEG-S04, LEG-F01, LEG-F03).
 * Regras transversais:
 * - Respostas de login, cadastro, recuperação e reenvio NÃO revelam se o e-mail existe.
 * - Segredos só são comparados em tempo constante (`constantTimeEqual`, também via `verifyPassword`/
 *   `verifyTotp`). Buscas por hash de 256 bits no banco não vazam informação útil.
 * - Logs só com `userId`/`operation`/`errorCode`. Nunca e-mail, senha, data de nascimento, código ou token.
 */
export interface AuthDeps {
  db: Db;
  kms: KmsProvider;
  mail: MailProvider;
  ageSignal: AgeSignalProvider;
  logger: Logger;
  /** Assina cookies do fluxo e serve de pepper dos códigos de recuperação (com separação de domínio). */
  sessionSecret: Uint8Array;
  rateLimitSecret: Uint8Array;
  appUrl: string;
  now?: () => Date;
}

export const SESSION_ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_TOUCH_MS = 5 * 60 * 1000;
export const VERIFY_EMAIL_TTL_S = 24 * 60 * 60;
export const RESET_PASSWORD_TTL_S = 30 * 60;
const TOTP_ISSUER = 'HealthMind 360';

export interface ResolvedSession {
  sessionId: string;
  userId: string;
  mfaPending: boolean;
  emailVerified: boolean;
}

export interface SessionSummary {
  id: string;
  deviceLabel: string;
  createdAt: Date;
  lastSeenAt: Date;
  current: boolean;
}

export interface RequestMeta {
  /** IP de origem, usado só como chave HMAC de limite de tentativas. */
  ip: string;
  userAgent?: string | null;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type AgeCheckResult =
  { outcome: 'adult'; cookie: string } | { outcome: 'minor' } | { outcome: 'invalid' };

export type RegisterResult =
  | { ok: true }
  | { ok: false; error: 'age_required' | 'rate_limited' }
  | { ok: false; error: 'weak_password'; problem: PasswordProblem };

export type LoginResult =
  { ok: true; token: string; mfaRequired: boolean } | { ok: false; error: 'invalid_credentials' };

export type MfaResult =
  | { ok: true; token: string }
  | { ok: false; error: 'invalid_code' | 'locked' | 'no_pending_session' };

export type ResetResult =
  | { ok: true }
  | { ok: false; error: 'invalid_token' }
  | { ok: false; error: 'weak_password'; problem: PasswordProblem };

export function createAuthService(deps: AuthDeps) {
  const { db, kms, mail, logger } = deps;
  const now = deps.now ?? (() => new Date());
  const withUser = <T>(userId: string, fn: (tx: Tx) => Promise<T>) => withUserOn(db, userId, fn);
  const limit = (name: RateLimitName, subject: string) =>
    rateLimitHit(db, deps.rateLimitSecret, name, subject, now());
  const link = (path: string, token: string) => {
    const url = new URL(path, deps.appUrl);
    url.searchParams.set('token', token);
    return url.toString();
  };
  const totpCtx = (userId: string) => ({ userId, table: 'users', column: 'totp_secret' });

  async function issueToken(
    userId: string,
    purpose: 'verify_email' | 'reset_password',
    ttlSeconds: number,
  ): Promise<string> {
    const token = randomToken();
    await db.$executeRaw`SELECT app.auth_issue_token(${userId}::uuid,
      ${purpose}::public.auth_token_purpose, ${sha256(token)}, ${ttlSeconds}::int)`;
    return token;
  }

  async function consumeToken(
    token: string,
    purpose: 'verify_email' | 'reset_password',
  ): Promise<string | null> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const rows = await db.$queryRaw<Array<{ user_id: string | null }>>`
      SELECT app.auth_consume_token(${sha256(token)}, ${purpose}::public.auth_token_purpose) AS user_id`;
    return rows[0]?.user_id ?? null;
  }

  async function createSession(
    userId: string,
    meta: RequestMeta,
    mfaPending: boolean,
  ): Promise<string> {
    const token = randomToken();
    const t = now().getTime();
    await withUser(userId, (tx) =>
      tx.session.create({
        data: {
          userId,
          tokenHash: sha256(token),
          deviceLabel: deviceLabel(meta.userAgent),
          mfaPending,
          lastSeenAt: new Date(t),
          idleExpiresAt: new Date(t + SESSION_IDLE_MS),
          expiresAt: new Date(t + (mfaPending ? 10 * 60 * 1000 : SESSION_ABSOLUTE_MS)),
        },
      }),
    );
    return token;
  }

  async function resolveRaw(token: string | undefined) {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const rows = await db.$queryRaw<
      Array<{
        session_id: string;
        user_id: string;
        mfa_pending: boolean;
        email_verified: boolean;
        last_seen_at: Date;
      }>
    >`SELECT * FROM app.auth_resolve_session(${sha256(token)})`;
    return rows[0] ?? null;
  }

  async function revokeAllSessions(userId: string, exceptSessionId?: string) {
    await withUser(userId, (tx) =>
      tx.session.updateMany({
        where: { revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
        data: { revokedAt: now() },
      }),
    );
  }

  return {
    /** Passo 1 do cadastro (LEG-F01, LEG-F03). Sem banco e sem log: menor não deixa rastro. */
    async checkAge(birthDate: string, headers: Headers): Promise<AgeCheckResult> {
      const birth = parseBirthDate(birthDate, now());
      if (!birth) return { outcome: 'invalid' };
      const signal = await deps.ageSignal.getAgeSignal(headers);
      if (signal.status === 'minor' || !isAdult(birth, now())) return { outcome: 'minor' };
      return { outcome: 'adult', cookie: signAgeOk(deps.sessionSecret, now()) };
    },

    /**
     * Passo 2 do cadastro. E-mail novo e e-mail existente recebem a MESMA resposta; o dono da conta
     * existente recebe um aviso por e-mail e nenhuma conta nova é criada.
     */
    async register(
      input: { email: string; password: string; ageOkCookie: string | undefined },
      meta: RequestMeta,
    ): Promise<RegisterResult> {
      if (!verifyAgeOk(deps.sessionSecret, input.ageOkCookie, now())) {
        return { ok: false, error: 'age_required' };
      }
      const email = normalizeEmail(input.email);
      const problem = checkPasswordPolicy(input.password, email);
      if (problem) return { ok: false, error: 'weak_password', problem };
      if (!(await limit('registerIp', meta.ip))) return { ok: false, error: 'rate_limited' };

      // Hash calculado sempre, antes de saber se o e-mail existe: tempo igual nos dois caminhos.
      const passwordHash = await hashPassword(input.password);
      const rows = await db.$queryRaw<Array<{ user_id: string; created: boolean }>>`
        SELECT * FROM app.auth_create_user(${email}, ${passwordHash}, ${AGE_GATE_VERSION})`;
      const row = rows[0];
      if (row?.created) {
        const token = await issueToken(row.user_id, 'verify_email', VERIFY_EMAIL_TTL_S);
        await mail.send({
          to: email,
          template: 'email-verification',
          params: { url: link('/verificar-email', token) },
        });
        logger.info('auth.registered', { userId: row.user_id });
      } else if (row) {
        await mail.send({
          to: email,
          template: 'account-exists',
          params: { url: new URL('/recuperar-senha', deps.appUrl).toString() },
        });
      }
      return { ok: true };
    },

    async verifyEmail(token: string): Promise<boolean> {
      const userId = await consumeToken(token, 'verify_email');
      if (!userId) return false;
      await withUser(userId, (tx) =>
        tx.user.update({ where: { id: userId }, data: { emailVerifiedAt: now() } }),
      );
      logger.info('auth.email_verified', { userId });
      return true;
    },

    /** Reenvio da verificação: resposta sempre igual. */
    async resendVerification(rawEmail: string, meta: RequestMeta): Promise<void> {
      if (!(await limit('resendIp', meta.ip))) return;
      const email = normalizeEmail(rawEmail);
      const rows = await db.$queryRaw<Array<{ user_id: string; email_verified: boolean }>>`
        SELECT * FROM app.auth_find_user_id(${email})`;
      const row = rows[0];
      if (!row || row.email_verified) return;
      const token = await issueToken(row.user_id, 'verify_email', VERIFY_EMAIL_TTL_S);
      await mail.send({
        to: email,
        template: 'email-verification',
        params: { url: link('/verificar-email', token) },
      });
    },

    /**
     * Login. E-mail inexistente, senha errada, conta excluída e bloqueio por tentativas devolvem o MESMO
     * erro. O caminho sem conta executa um hash falso para igualar o tempo.
     */
    async login(
      input: { email: string; password: string },
      meta: RequestMeta,
    ): Promise<LoginResult> {
      const email = normalizeEmail(input.email);
      const fail = { ok: false, error: 'invalid_credentials' } as const;
      const accountOk = await limit('loginAccount', email);
      const ipOk = await limit('loginIp', meta.ip);
      const rows = await db.$queryRaw<
        Array<{ user_id: string; password_hash: string; mfa_enabled: boolean }>
      >`SELECT user_id, password_hash, mfa_enabled FROM app.auth_find_login(${email})`;
      const row = rows[0];

      const passwordOk = row
        ? await verifyPassword(input.password, row.password_hash)
        : await verifyAgainstDummy(input.password);

      if (!accountOk || !ipOk) {
        logger.warn('auth.login_rate_limited', { errorCode: 'rate_limited' });
        return fail;
      }
      if (!row || !passwordOk) {
        logger.info('auth.login_failed', { errorCode: 'invalid_credentials' });
        return fail;
      }
      const token = await createSession(row.user_id, meta, row.mfa_enabled);
      logger.info(row.mfa_enabled ? 'auth.login_mfa_pending' : 'auth.login_succeeded', {
        userId: row.user_id,
      });
      return { ok: true, token, mfaRequired: row.mfa_enabled };
    },

    /**
     * Segundo fator: TOTP (sem reuso do passo) ou código de recuperação (uso único). No sucesso, a sessão
     * pendente é revogada e uma nova é criada (troca de identificador). 5 erros revogam a sessão pendente.
     */
    async verifyMfa(
      pendingToken: string | undefined,
      code: string,
      meta: RequestMeta,
    ): Promise<MfaResult> {
      const s = await resolveRaw(pendingToken);
      if (!s || !s.mfa_pending) return { ok: false, error: 'no_pending_session' };
      const userId = s.user_id;

      const attempts = await withUser(userId, (tx) =>
        tx.session.update({
          where: { id: s.session_id },
          data: { mfaAttempts: { increment: 1 } },
          select: { mfaAttempts: true },
        }),
      );
      if (attempts.mfaAttempts > MFA_MAX_ATTEMPTS) {
        await withUser(userId, (tx) =>
          tx.session.update({ where: { id: s.session_id }, data: { revokedAt: now() } }),
        );
        logger.warn('auth.mfa_locked', { userId });
        return { ok: false, error: 'locked' };
      }

      const accepted = looksLikeRecoveryCode(code)
        ? await consumeRecoveryCode(userId, code)
        : await acceptTotp(userId, code);
      if (!accepted) {
        logger.info('auth.mfa_failed', { userId, errorCode: 'invalid_code' });
        return { ok: false, error: 'invalid_code' };
      }

      await withUser(userId, (tx) =>
        tx.session.update({ where: { id: s.session_id }, data: { revokedAt: now() } }),
      );
      const token = await createSession(userId, meta, false);
      logger.info('auth.login_succeeded', { userId, operation: 'mfa' });
      return { ok: true, token };
    },

    /** Valida o cookie de sessão no banco a cada requisição (LEG-S04). */
    async resolveSession(token: string | undefined): Promise<ResolvedSession | null> {
      const s = await resolveRaw(token);
      if (!s) return null;
      const t = now().getTime();
      if (t - s.last_seen_at.getTime() > SESSION_TOUCH_MS) {
        await withUser(s.user_id, (tx) =>
          tx.session.updateMany({
            where: { id: s.session_id, revokedAt: null },
            data: { lastSeenAt: new Date(t), idleExpiresAt: new Date(t + SESSION_IDLE_MS) },
          }),
        );
      }
      return {
        sessionId: s.session_id,
        userId: s.user_id,
        mfaPending: s.mfa_pending,
        emailVerified: s.email_verified,
      };
    },

    async logout(token: string | undefined): Promise<void> {
      const s = await resolveRaw(token);
      if (!s) return;
      await withUser(s.user_id, (tx) =>
        tx.session.update({ where: { id: s.session_id }, data: { revokedAt: now() } }),
      );
      logger.info('auth.logout', { userId: s.user_id });
    },

    async listSessions(userId: string, currentSessionId: string): Promise<SessionSummary[]> {
      const rows = await withUser(userId, (tx) =>
        tx.session.findMany({
          where: {
            revokedAt: null,
            mfaPending: false,
            expiresAt: { gt: now() },
            idleExpiresAt: { gt: now() },
          },
          orderBy: { lastSeenAt: 'desc' },
          select: { id: true, deviceLabel: true, createdAt: true, lastSeenAt: true },
        }),
      );
      return rows.map((r) => ({ ...r, current: r.id === currentSessionId }));
    },

    /** Revoga uma sessão. O RLS garante que só sessões do próprio usuário são alcançadas. */
    async revokeSession(userId: string, sessionId: string): Promise<boolean> {
      const { count } = await withUser(userId, (tx) =>
        tx.session.updateMany({
          where: { id: sessionId, revokedAt: null },
          data: { revokedAt: now() },
        }),
      );
      if (count > 0) logger.info('auth.session_revoked', { userId });
      return count > 0;
    },

    async revokeOtherSessions(userId: string, currentSessionId: string): Promise<void> {
      await revokeAllSessions(userId, currentSessionId);
      logger.info('auth.sessions_revoked', { userId, operation: 'others' });
    },

    /** Pedido de redefinição: resposta sempre igual; e-mail só se a conta existir. */
    async requestPasswordReset(rawEmail: string, meta: RequestMeta): Promise<void> {
      const email = normalizeEmail(rawEmail);
      if (!(await limit('resetIp', meta.ip))) return;
      if (!(await limit('resetAccount', email))) return;
      const rows = await db.$queryRaw<Array<{ user_id: string }>>`
        SELECT user_id FROM app.auth_find_user_id(${email})`;
      const row = rows[0];
      if (!row) return;
      const token = await issueToken(row.user_id, 'reset_password', RESET_PASSWORD_TTL_S);
      await mail.send({
        to: email,
        template: 'password-reset',
        params: { url: link('/redefinir-senha', token) },
      });
      logger.info('auth.password_reset_requested', { userId: row.user_id });
    },

    /** Redefinição: token de uso único; troca o hash e revoga TODAS as sessões. */
    async resetPassword(token: string, password: string): Promise<ResetResult> {
      const problem = checkPasswordPolicy(password);
      if (problem) return { ok: false, error: 'weak_password', problem };
      const userId = await consumeToken(token, 'reset_password');
      if (!userId) return { ok: false, error: 'invalid_token' };
      const passwordHash = await hashPassword(password);
      await withUser(userId, (tx) =>
        tx.user.update({
          where: { id: userId },
          // Quem recebeu o link provou o controle do e-mail.
          data: { passwordHash, emailVerifiedAt: now() },
        }),
      );
      await revokeAllSessions(userId);
      logger.info('auth.password_reset', { userId });
      return { ok: true };
    },

    async changePassword(
      userId: string,
      currentSessionId: string,
      current: string,
      next: string,
    ): Promise<{ ok: true } | { ok: false; error: 'invalid_password' | PasswordProblem }> {
      if (!(await checkCurrentPassword(userId, current))) {
        return { ok: false, error: 'invalid_password' };
      }
      const problem = checkPasswordPolicy(next);
      if (problem) return { ok: false, error: problem };
      const passwordHash = await hashPassword(next);
      await withUser(userId, (tx) =>
        tx.user.update({ where: { id: userId }, data: { passwordHash } }),
      );
      await revokeAllSessions(userId, currentSessionId);
      logger.info('auth.password_changed', { userId });
      return { ok: true };
    },

    async getSecurityOverview(
      userId: string,
    ): Promise<{ mfaEnabled: boolean; recoveryLeft: number }> {
      return withUser(userId, async (tx) => {
        const user = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { mfaEnabledAt: true },
        });
        const recoveryLeft = await tx.recoveryCode.count({ where: { usedAt: null } });
        return { mfaEnabled: user.mfaEnabledAt !== null, recoveryLeft };
      });
    },

    /** Gera (ou regenera) o segredo pendente, cifrado em `users.totp_secret`. Só sem MFA ativo. */
    async startTotpSetup(
      userId: string,
    ): Promise<{ ok: true; manualKey: string; uri: string; qrSvg: string } | { ok: false }> {
      const secret = generateTotpSecret();
      try {
        const encrypted = await encryptField(kms, totpCtx(userId), secret);
        const { count } = await withUser(userId, (tx) =>
          tx.user.updateMany({
            where: { id: userId, mfaEnabledAt: null },
            data: { totpSecret: encrypted, totpLastUsedStep: null },
          }),
        );
        if (count === 0) return { ok: false };
        const uri = otpauthUri(secret, 'Conta', TOTP_ISSUER);
        return { ok: true, manualKey: formatManualKey(secret), uri, qrSvg: totpQrSvg(uri) };
      } finally {
        secret.fill(0);
      }
    },

    /** Confirma o TOTP com um código válido, ativa o MFA e devolve os códigos de recuperação (uma vez). */
    async confirmTotpSetup(
      userId: string,
      currentSessionId: string,
      code: string,
    ): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false }> {
      const enabled = await withUser(userId, (tx) =>
        tx.user.findUniqueOrThrow({ where: { id: userId }, select: { mfaEnabledAt: true } }),
      );
      if (enabled.mfaEnabledAt) return { ok: false };
      if (!(await acceptTotp(userId, code))) return { ok: false };
      const codes = generateRecoveryCodes();
      await withUser(userId, async (tx) => {
        await tx.user.update({ where: { id: userId }, data: { mfaEnabledAt: now() } });
        await replaceRecoveryCodes(tx, userId, codes);
      });
      // Outras sessões abertas sem o 2º fator são encerradas; a atual continua.
      await revokeAllSessions(userId, currentSessionId);
      logger.info('auth.mfa_enabled', { userId });
      return { ok: true, recoveryCodes: codes };
    },

    async regenerateRecoveryCodes(
      userId: string,
      password: string,
    ): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false }> {
      if (!(await checkCurrentPassword(userId, password))) return { ok: false };
      const codes = generateRecoveryCodes();
      const done = await withUser(userId, async (tx) => {
        const u = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { mfaEnabledAt: true },
        });
        if (!u.mfaEnabledAt) return false;
        await replaceRecoveryCodes(tx, userId, codes);
        return true;
      });
      if (!done) return { ok: false };
      logger.info('auth.recovery_codes_regenerated', { userId });
      return { ok: true, recoveryCodes: codes };
    },

    /** Desativar o MFA exige senha e um código (TOTP ou recuperação). */
    async disableMfa(userId: string, password: string, code: string): Promise<boolean> {
      if (!(await checkCurrentPassword(userId, password))) return false;
      const accepted = looksLikeRecoveryCode(code)
        ? await consumeRecoveryCode(userId, code)
        : await acceptTotp(userId, code);
      if (!accepted) return false;
      await withUser(userId, async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: { mfaEnabledAt: null, totpSecret: null, totpLastUsedStep: null },
        });
        await tx.recoveryCode.deleteMany({});
      });
      logger.info('auth.mfa_disabled', { userId });
      return true;
    },
  };

  async function checkCurrentPassword(userId: string, password: string): Promise<boolean> {
    const user = await withUser(userId, (tx) =>
      tx.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } }),
    );
    return verifyPassword(password, user.passwordHash);
  }

  /**
   * Aceita o TOTP e grava o passo de forma atômica: passos <= ao último usado são recusados, inclusive em
   * requisições simultâneas com o mesmo código (só um UPDATE afeta a linha).
   */
  async function acceptTotp(userId: string, code: string): Promise<boolean> {
    const user = await withUser(userId, (tx) =>
      tx.user.findUniqueOrThrow({ where: { id: userId }, select: { totpSecret: true } }),
    );
    if (!user.totpSecret) return false;
    const secret = await decryptField(kms, totpCtx(userId), user.totpSecret);
    let step: number | null;
    try {
      step = verifyTotp(secret, code, now().getTime());
    } finally {
      secret.fill(0);
    }
    if (step === null) return false;
    const updated = await withUser(
      userId,
      (tx) =>
        tx.$executeRaw`UPDATE public.users SET totp_last_used_step = ${BigInt(step)}, updated_at = now()
        WHERE id = ${userId}::uuid
          AND (totp_last_used_step IS NULL OR totp_last_used_step < ${BigInt(step)})`,
    );
    return updated === 1;
  }

  /** Código de recuperação: uso único, marcado de forma atômica. */
  async function consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
    const codeHash = hashRecoveryCode(deps.sessionSecret, code);
    const { count } = await withUser(userId, (tx) =>
      tx.recoveryCode.updateMany({ where: { codeHash, usedAt: null }, data: { usedAt: now() } }),
    );
    if (count === 1) logger.info('auth.recovery_code_used', { userId });
    return count === 1;
  }

  async function replaceRecoveryCodes(tx: Tx, userId: string, codes: string[]) {
    await tx.recoveryCode.deleteMany({});
    await tx.recoveryCode.createMany({
      data: codes.map((c) => ({ userId, codeHash: hashRecoveryCode(deps.sessionSecret, c) })),
    });
  }
}

export type AuthService = ReturnType<typeof createAuthService>;
