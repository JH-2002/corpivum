import type { AgeSignalProvider } from '@/adapters/age-signal/types';
import type { KmsProvider } from '@/adapters/kms/types';
import type { MailProvider } from '@/adapters/mail/types';
import { decryptField, encryptField } from '@/lib/crypto/field';
import { auditAppend } from '@/lib/db/audit';
import type { Db } from '@/lib/db/client';
import { withUserOn, type Tx } from '@/lib/db/rls';
import type { Logger } from '@/lib/logger';
import { AGE_GATE_VERSION, isAdult, parseBirthDate, signAgeOk, verifyAgeOk } from './age';
import { randomToken, sha256 } from './crypto';
import { deviceLabel } from './device';
import { canonicalMailbox, normalizeEmail } from './email';
import { signKnownDevice, verifyKnownDevice } from './known-device';
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
  /**
   * Executa trabalho fora da resposta (no Next: `after()`). Sem `defer`, roda em linha (testes).
   * Usado para o que depende de a conta existir (token + e-mail): o tempo de resposta fica igual com ou
   * sem conta (anti-enumeração).
   */
  defer?: (task: () => Promise<void>) => void;
}

export const SESSION_ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_TOUCH_MS = 5 * 60 * 1000;
export const VERIFY_EMAIL_TTL_S = 24 * 60 * 60;
export const RESET_PASSWORD_TTL_S = 30 * 60;
const TOTP_ISSUER = 'HealthMind 360';
export const TOTP_SETUP_TTL_MS = 15 * 60 * 1000;

export interface PurgeResult {
  sessions: number;
  tokens: number;
  buckets: number;
  unverified_users: number;
  pending_totp: number;
}

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
  /**
   * IP de origem: chave HMAC de limite de tentativas e registro de acesso (Marco Civil art. 15, LEG-R02),
   * gravado só em `access_logs` (tabela que o runtime não lê, expurgada por ACCESS_LOG_RETENTION_DAYS).
   */
  ip: string;
  userAgent?: string | null;
  /** Valor do cookie de aparelho conhecido (OI-15), se houver. */
  knownDevice?: string;
}

export { normalizeEmail };

export type AgeCheckResult =
  { outcome: 'adult'; cookie: string } | { outcome: 'minor' } | { outcome: 'invalid' };

export type RegisterResult =
  | { ok: true }
  | { ok: false; error: 'age_required' | 'rate_limited' }
  | { ok: false; error: 'weak_password'; problem: PasswordProblem };

/** `knownDevice`: novo cookie de aparelho conhecido, emitido só ao fim do login completo (OI-15). */
export type LoginResult =
  | { ok: true; token: string; mfaRequired: true }
  | { ok: true; token: string; mfaRequired: false; knownDevice: string }
  | { ok: false; error: 'invalid_credentials' };

export type MfaResult =
  | { ok: true; token: string; knownDevice: string }
  | { ok: false; error: 'invalid_code' | 'locked' | 'no_pending_session' };

export type ResetResult =
  | { ok: true }
  | { ok: false; error: 'invalid_token' }
  | { ok: false; error: 'weak_password'; problem: PasswordProblem };

export function createAuthService(deps: AuthDeps) {
  const { db, kms, mail, logger } = deps;
  const now = deps.now ?? (() => new Date());
  const withUser = <T>(userId: string, fn: (tx: Tx) => Promise<T>) => withUserOn(db, userId, fn);
  const limitHit = (name: RateLimitName, subject: string) =>
    rateLimitHit(db, deps.rateLimitSecret, name, subject, now());
  const limit = async (name: RateLimitName, subject: string) =>
    (await limitHit(name, subject)).allowed;

  /**
   * Limite de 2º fator por CONTA (TOTP e códigos de recuperação, somados entre sessões). Ao bloquear,
   * avisa o titular por e-mail uma vez por janela (bloqueio temporário de 1 h).
   */
  async function mfaAccountAllowed(userId: string): Promise<boolean> {
    const r = await limitHit('mfaAccount', userId);
    if (r.justLocked) {
      logger.warn('auth.mfa_account_locked', { userId });
      await notifySecurity(userId, 'mfa_locked');
    }
    return r.allowed;
  }
  const link = (path: string, token: string) => {
    const url = new URL(path, deps.appUrl);
    url.searchParams.set('token', token);
    return url.toString();
  };
  const totpCtx = (userId: string) => ({ userId, table: 'users', column: 'totp_secret' });

  async function background(task: () => Promise<void>): Promise<void> {
    const safe = async () => {
      try {
        await task();
      } catch {
        logger.error('auth.background_failed', { errorCode: 'background' });
      }
    };
    if (deps.defer) deps.defer(safe);
    else await safe();
  }

  /** Aviso ao titular sobre mudança de segurança da conta (só o tipo do evento, sem dados). */
  async function notifySecurity(
    userId: string,
    event: 'mfa_enabled' | 'mfa_disabled' | 'password_changed' | 'mfa_locked',
  ) {
    await background(async () => {
      const user = await withUser(userId, (tx) =>
        tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } }),
      );
      await mail.send({
        to: user.email,
        template: 'security-alert',
        params: { event, url: new URL('/configuracoes/seguranca', deps.appUrl).toString() },
      });
    });
  }

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
    await withUser(userId, async (tx) => {
      await tx.session.create({
        data: {
          userId,
          tokenHash: sha256(token),
          deviceLabel: deviceLabel(meta.userAgent),
          mfaPending,
          lastSeenAt: new Date(t),
          idleExpiresAt: new Date(t + SESSION_IDLE_MS),
          expiresAt: new Date(t + (mfaPending ? 10 * 60 * 1000 : SESSION_ABSOLUTE_MS)),
        },
      });
      // Registro de acesso (LEG-R02) só para sessão completa.
      if (!mfaPending) await appendAccessLog(tx, meta);
    });
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
    await withUser(userId, async (tx) => {
      const { count } = await tx.session.updateMany({
        where: { revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
        data: { revokedAt: now() },
      });
      if (count > 0) await auditAppend(tx, 'session_revoked', 'session');
    });
  }

  /** IP + data/hora no contexto do usuário (LEG-R02). IP inválido vira NULL no banco. */
  async function appendAccessLog(tx: Tx, meta: RequestMeta) {
    await tx.$executeRaw`SELECT app.access_log_append(${meta.ip})`;
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
      await background(async () => {
        // Limite por destinatário dentro do trabalho adiado: não muda resposta nem tempo (anti-enumeração).
        if (!(await limit('registerAccount', canonicalMailbox(email)))) return;
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
      });
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
      await background(async () => {
        const rows = await db.$queryRaw<Array<{ user_id: string; email_verified: boolean }>>`
          SELECT * FROM app.auth_find_user_id(${email})`;
        const row = rows[0];
        if (!row || row.email_verified) return;
        if (!(await limit('resendAccount', canonicalMailbox(email)))) return;
        const token = await issueToken(row.user_id, 'verify_email', VERIFY_EMAIL_TTL_S);
        await mail.send({
          to: email,
          template: 'email-verification',
          params: { url: link('/verificar-email', token) },
        });
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
      // A busca roda sempre (com ou sem conta, antes dos limites): o caminho não depende de a conta existir.
      const rows = await db.$queryRaw<
        Array<{ user_id: string; password_hash: string; mfa_enabled: boolean }>
      >`SELECT user_id, password_hash, mfa_enabled FROM app.auth_find_login(${email})`;
      const row = rows[0];
      // OI-15: aparelho conhecido usa o próprio limite; o bloqueio por conta só alcança aparelhos
      // desconhecidos. Esgotado o limite do aparelho, ele volta a contar no limite da conta. O cookie vale
      // só para a senha atual (B4).
      const device = verifyKnownDevice(
        deps.sessionSecret,
        meta.knownDevice,
        email,
        row?.password_hash ?? null,
      );
      const deviceOk = device !== null && (await limit('loginDevice', device));
      const accountOk = deviceOk || (await limit('loginAccount', email));
      const ipOk = await limit('loginIp', meta.ip);
      // Bloqueado: responde sem calcular Argon2 (evita esgotar CPU/memória). O bloqueio não revela se a
      // conta existe: e-mails inexistentes também são contados.
      if (!accountOk || !ipOk) {
        logger.warn('auth.login_rate_limited', { errorCode: 'rate_limited' });
        return fail;
      }

      const passwordOk = row
        ? await verifyPassword(input.password, row.password_hash)
        : await verifyAgainstDummy(input.password);

      if (!row || !passwordOk) {
        logger.info('auth.login_failed', { errorCode: 'invalid_credentials' });
        return fail;
      }
      const token = await createSession(row.user_id, meta, row.mfa_enabled);
      logger.info(row.mfa_enabled ? 'auth.login_mfa_pending' : 'auth.login_succeeded', {
        userId: row.user_id,
      });
      if (row.mfa_enabled) return { ok: true, token, mfaRequired: true };
      return {
        ok: true,
        token,
        mfaRequired: false,
        knownDevice: signKnownDevice(deps.sessionSecret, email, row.password_hash),
      };
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
      // Limite por conta: abrir novas sessões pendentes não renova as tentativas.
      const accountOk = await mfaAccountAllowed(userId);
      if (attempts.mfaAttempts > MFA_MAX_ATTEMPTS || !accountOk) {
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
      const { email, passwordHash } = await withUser(userId, (tx) =>
        tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { email: true, passwordHash: true },
        }),
      );
      logger.info('auth.login_succeeded', { userId, operation: 'mfa' });
      return {
        ok: true,
        token,
        knownDevice: signKnownDevice(deps.sessionSecret, email, passwordHash),
      };
    },

    /** Valida o cookie de sessão no banco a cada requisição (LEG-S04). */
    async resolveSession(
      token: string | undefined,
      meta?: RequestMeta,
    ): Promise<ResolvedSession | null> {
      const s = await resolveRaw(token);
      if (!s) return null;
      const t = now().getTime();
      // A cada 5 min de uso: renova a ociosidade e registra o acesso (LEG-R02), sem uma linha por requisição.
      if (t - s.last_seen_at.getTime() > SESSION_TOUCH_MS) {
        await withUser(s.user_id, async (tx) => {
          const { count } = await tx.session.updateMany({
            where: { id: s.session_id, revokedAt: null },
            data: { lastSeenAt: new Date(t), idleExpiresAt: new Date(t + SESSION_IDLE_MS) },
          });
          if (count > 0 && meta && !s.mfa_pending) await appendAccessLog(tx, meta);
        });
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
      const { count } = await withUser(userId, async (tx) => {
        const r = await tx.session.updateMany({
          where: { id: sessionId, revokedAt: null },
          data: { revokedAt: now() },
        });
        if (r.count > 0) await auditAppend(tx, 'session_revoked', 'session', sessionId);
        return r;
      });
      if (count > 0) logger.info('auth.session_revoked', { userId });
      return count > 0;
    },

    async revokeOtherSessions(userId: string, currentSessionId: string): Promise<void> {
      await revokeAllSessions(userId, currentSessionId);
      logger.info('auth.sessions_revoked', { userId, operation: 'others' });
    },

    /**
     * Pedido de redefinição: resposta sempre igual; e-mail só se a conta existir. Limite por caixa de
     * destino (PR1a-R3-M1); aparelho conhecido usa limite próprio, então terceiros não bloqueiam a
     * recuperação do titular (OI-15).
     */
    async requestPasswordReset(rawEmail: string, meta: RequestMeta): Promise<void> {
      const email = normalizeEmail(rawEmail);
      if (!(await limit('resetIp', meta.ip))) return;
      await background(async () => {
        const rows = await db.$queryRaw<Array<{ user_id: string; password_hash: string }>>`
          SELECT user_id, password_hash FROM app.auth_find_login(${email})`;
        const row = rows[0];
        const device = verifyKnownDevice(
          deps.sessionSecret,
          meta.knownDevice,
          email,
          row?.password_hash ?? null,
        );
        const deviceOk = device !== null && (await limit('resetDevice', device));
        if (!deviceOk && !(await limit('resetAccount', canonicalMailbox(email)))) return;
        if (!row) return;
        const token = await issueToken(row.user_id, 'reset_password', RESET_PASSWORD_TTL_S);
        await mail.send({
          to: email,
          template: 'password-reset',
          params: { url: link('/redefinir-senha', token) },
        });
        logger.info('auth.password_reset_requested', { userId: row.user_id });
      });
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
      await notifySecurity(userId, 'password_changed');
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

    /**
     * Gera (ou regenera) o segredo pendente, cifrado em `users.totp_secret`. Só sem MFA ativo e com a
     * senha atual: um cookie roubado sozinho não basta para prender a conta num autenticador alheio.
     */
    async startTotpSetup(
      userId: string,
      password: string,
    ): Promise<{ ok: true; manualKey: string; qrSvg: string } | { ok: false }> {
      if (!(await checkCurrentPassword(userId, password))) return { ok: false };
      const secret = generateTotpSecret();
      try {
        const encrypted = await encryptField(kms, totpCtx(userId), secret);
        const { count } = await withUser(userId, (tx) =>
          tx.user.updateMany({
            where: { id: userId, mfaEnabledAt: null },
            data: { totpSecret: encrypted, totpLastUsedStep: null, totpSetupStartedAt: now() },
          }),
        );
        if (count === 0) return { ok: false };
        const uri = otpauthUri(secret, 'Conta', TOTP_ISSUER);
        // O URI (com o segredo) só vira QR no servidor; não vai ao cliente.
        return { ok: true, manualKey: formatManualKey(secret), qrSvg: totpQrSvg(uri) };
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
      const pending = await withUser(userId, (tx) =>
        tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { mfaEnabledAt: true, totpSetupStartedAt: true },
        }),
      );
      if (pending.mfaEnabledAt || !pending.totpSetupStartedAt) return { ok: false };
      // Segredo pendente vale 15 min; depois disso, é preciso recomeçar (com a senha).
      if (now().getTime() - pending.totpSetupStartedAt.getTime() > TOTP_SETUP_TTL_MS) {
        return { ok: false };
      }
      // Mesmo limite por conta do 2º fator: uma sessão roubada não testa códigos à vontade.
      if (!(await mfaAccountAllowed(userId))) return { ok: false };
      if (!(await acceptTotp(userId, code))) return { ok: false };
      const codes = generateRecoveryCodes();
      // Ativação condicional na mesma transação: duas confirmações simultâneas não geram dois conjuntos.
      const activated = await withUser(userId, async (tx) => {
        const { count } = await tx.user.updateMany({
          where: { id: userId, mfaEnabledAt: null },
          data: { mfaEnabledAt: now(), totpSetupStartedAt: null },
        });
        if (count === 0) return false;
        await replaceRecoveryCodes(tx, userId, codes);
        return true;
      });
      if (!activated) return { ok: false };
      // Outras sessões abertas sem o 2º fator são encerradas; a atual continua.
      await revokeAllSessions(userId, currentSessionId);
      logger.info('auth.mfa_enabled', { userId });
      await notifySecurity(userId, 'mfa_enabled');
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
      if (!(await mfaAccountAllowed(userId))) return false;
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
      await notifySecurity(userId, 'mfa_disabled');
      return true;
    },

    /**
     * Reautenticação para ações destrutivas fora do módulo (encerramento de conta de menor, LEG-F04; exclusão
     * de conta, LEG-D04). Confere a senha atual (com limite) e registra no banco o hash de um nonce de uso
     * único, válido por 2 min, que a ação consome (`app.reauth_issue`; revisão M1). Devolve o nonce, ou null.
     * Com MFA ligado, toda ação destrutiva exige também o TOTP ou um código de recuperação (limite `mfaAccount`;
     * revisão M1 da 6b: o encerramento de menor apaga a conta tanto quanto a exclusão).
     */
    async issueReauthProof(
      userId: string,
      password: string,
      purpose: 'minor_closure' | 'account_deletion',
      mfaCode?: string,
    ): Promise<string | null> {
      const mfa = await withUser(userId, (tx) =>
        tx.user.findUniqueOrThrow({ where: { id: userId }, select: { mfaEnabledAt: true } }),
      );
      if (mfa.mfaEnabledAt) {
        const code = mfaCode?.trim() ?? '';
        if (!code || !(await mfaAccountAllowed(userId))) return null;
        if (!(await checkCurrentPassword(userId, password))) return null;
        const accepted = looksLikeRecoveryCode(code)
          ? await consumeRecoveryCode(userId, code)
          : await acceptTotp(userId, code);
        if (!accepted) return null;
        return issueProof(userId, purpose);
      }
      if (!(await checkCurrentPassword(userId, password))) return null;
      return issueProof(userId, purpose);
    },

    /**
     * Expurgo de dados de autenticação vencidos (ROPA T1/T5, job `auth.purge_expired`): sessões e tokens
     * vencidos há mais de 1 dia, janelas de limite encerradas, contas com e-mail nunca verificado após
     * 7 dias e segredos TOTP de ativações abandonadas após 1 dia.
     * Apagar contas pressupõe que só tabelas de auth e de dados do usuário têm FK para `users`: as
     * provas (consentimentos, pedidos, AuditLog) e o AccessLog não têm FK e ficam (PR1a-R3-B8).
     */
    async purgeExpired(): Promise<PurgeResult> {
      const rows = await db.$queryRaw<Array<PurgeResult>>`SELECT * FROM app.auth_purge_expired()`;
      const r = rows[0] ?? {
        sessions: 0,
        tokens: 0,
        buckets: 0,
        unverified_users: 0,
        pending_totp: 0,
      };
      logger.info('auth.purge_expired', {
        count: r.sessions + r.tokens + r.buckets + r.unverified_users + r.pending_totp,
      });
      return r;
    },
  };

  async function issueProof(userId: string, purpose: string): Promise<string> {
    const nonce = randomToken();
    await withUser(
      userId,
      (tx) => tx.$executeRaw`SELECT app.reauth_issue(${purpose}, ${sha256(nonce)})`,
    );
    return nonce;
  }

  /** Reautenticação nas ações da conta, com limite por usuário (sessão roubada não testa senhas à vontade). */
  async function checkCurrentPassword(userId: string, password: string): Promise<boolean> {
    if (!(await limit('reauthUser', userId))) {
      logger.warn('auth.reauth_rate_limited', { userId, errorCode: 'rate_limited' });
      return false;
    }
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
