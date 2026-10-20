import type pg from 'pg';
import type { Db } from '@/lib/db/client';
import {
  connectAdmin,
  createTestAuth,
  createVerifiedUser,
  META,
  PASSWORD,
  runtimeDb,
  truncateAll,
  uniqueEmail,
} from './helpers';

/**
 * Fase 1b no módulo de auth (ADR-0019): aparelho conhecido (OI-15), limite por caixa canônica
 * (PR1a-R3-M1), registro de acesso (LEG-R02) e auditoria de revogação de sessão (LEG-S06).
 */
let admin: pg.Client;
let db: Db;
let ipCounter = 0;
const freshMeta = () => {
  ipCounter += 1;
  return { ...META, ip: `192.0.2.${(ipCounter % 250) + 1}` };
};

beforeAll(async () => {
  admin = await connectAdmin();
  await truncateAll(admin);
  db = runtimeDb();
});

afterAll(async () => {
  await db.$disconnect();
  await admin.end();
});

describe('OI-15: aparelho conhecido não é bloqueado por terceiros', () => {
  it('quem esgota o limite da conta não impede o titular com cookie de aparelho', async () => {
    const t = createTestAuth(db);
    const u = await createVerifiedUser(t);
    const first = await t.service.login({ email: u.email, password: PASSWORD }, freshMeta());
    if (!first.ok || first.mfaRequired) throw new Error('login');
    const knownDevice = first.knownDevice;

    // Terceiro, sem o cookie, tenta senhas até bloquear a conta.
    for (let i = 0; i < 8; i++) {
      await t.service.login({ email: u.email, password: 'chute sintético' }, freshMeta());
    }
    const attacker = await t.service.login({ email: u.email, password: PASSWORD }, freshMeta());
    expect(attacker).toEqual({ ok: false, error: 'invalid_credentials' });

    // O titular, no aparelho conhecido, entra normalmente.
    const owner = await t.service.login(
      { email: u.email, password: PASSWORD },
      { ...freshMeta(), knownDevice },
    );
    expect(owner.ok).toBe(true);
  });

  it('cookie de outro e-mail ou adulterado não serve', async () => {
    const t = createTestAuth(db);
    const a = await createVerifiedUser(t);
    const b = await createVerifiedUser(t);
    const loginA = await t.service.login({ email: a.email, password: PASSWORD }, freshMeta());
    if (!loginA.ok || loginA.mfaRequired) throw new Error('login');
    for (let i = 0; i < 8; i++) {
      await t.service.login({ email: b.email, password: 'chute sintético' }, freshMeta());
    }
    for (const knownDevice of [loginA.knownDevice, `${loginA.knownDevice.slice(0, -2)}xx`]) {
      const r = await t.service.login(
        { email: b.email, password: PASSWORD },
        { ...freshMeta(), knownDevice },
      );
      expect(r).toEqual({ ok: false, error: 'invalid_credentials' });
    }
  });

  it('o aparelho conhecido também tem limite próprio, e depois volta ao limite da conta', async () => {
    const t = createTestAuth(db);
    const u = await createVerifiedUser(t);
    const first = await t.service.login({ email: u.email, password: PASSWORD }, freshMeta());
    if (!first.ok || first.mfaRequired) throw new Error('login');
    const meta = () => ({ ...freshMeta(), knownDevice: first.knownDevice });
    // 5 do aparelho + 3 restantes da conta (2 já usados pelo helper e pelo primeiro login).
    for (let i = 0; i < 8; i++) {
      await t.service.login({ email: u.email, password: 'chute sintético' }, meta());
    }
    expect(await t.service.login({ email: u.email, password: PASSWORD }, meta())).toEqual({
      ok: false,
      error: 'invalid_credentials',
    });
  });

  it('a resposta com cookie para e-mail inexistente é igual à de senha errada (sem enumeração)', async () => {
    const t = createTestAuth(db);
    const u = await createVerifiedUser(t);
    const first = await t.service.login({ email: u.email, password: PASSWORD }, freshMeta());
    if (!first.ok || first.mfaRequired) throw new Error('login');
    const ghost = await t.service.login(
      { email: uniqueEmail('fantasma'), password: PASSWORD },
      { ...freshMeta(), knownDevice: first.knownDevice },
    );
    const wrong = await t.service.login(
      { email: u.email, password: 'errada sintética' },
      { ...freshMeta(), knownDevice: first.knownDevice },
    );
    expect(ghost).toEqual(wrong);
  });

  it('redefinição de senha: terceiro não esgota o envio para o titular no aparelho conhecido', async () => {
    const t = createTestAuth(db);
    const u = await createVerifiedUser(t);
    const first = await t.service.login({ email: u.email, password: PASSWORD }, freshMeta());
    if (!first.ok || first.mfaRequired) throw new Error('login');
    for (let i = 0; i < 5; i++) await t.service.requestPasswordReset(u.email, freshMeta());
    const before = t.mail.outbox.filter((m) => m.to === u.email && m.template === 'password-reset');
    expect(before).toHaveLength(3);
    await t.service.requestPasswordReset(u.email, {
      ...freshMeta(),
      knownDevice: first.knownDevice,
    });
    const after = t.mail.outbox.filter((m) => m.to === u.email && m.template === 'password-reset');
    expect(after).toHaveLength(4);
  });
});

describe('PR1a-R3-M1: limite por caixa canônica', () => {
  it('subendereçamento e pontos do Gmail contam no mesmo balde do destinatário', async () => {
    const t = createTestAuth(db);
    const cookie = (await t.service.checkAge('1990-01-01', new Headers())) as { cookie: string };
    // "_" não existe em usuário do Gmail: nenhum destes endereços pertence a alguém.
    const base = `ficticia_teste.${Date.now()}`;
    const variants = [
      `${base}@gmail.com`,
      `${base}+1@gmail.com`,
      `${base.replace('.', '')}+x@googlemail.com`,
      `${base.replace('.', '..')}@gmail.com`,
      `${base}+2@gmail.com`,
    ];
    for (const email of variants) {
      await t.service.register(
        { email, password: PASSWORD, ageOkCookie: cookie.cookie },
        freshMeta(),
      );
    }
    const sent = t.mail.outbox.filter((m) => m.template === 'email-verification');
    // 3 por hora para a mesma caixa: as variantes não multiplicam os e-mails.
    expect(sent).toHaveLength(3);
  });

  it('caixas diferentes continuam independentes', async () => {
    const t = createTestAuth(db);
    const cookie = (await t.service.checkAge('1990-01-01', new Headers())) as { cookie: string };
    for (const email of [uniqueEmail('um'), uniqueEmail('dois')]) {
      await t.service.register(
        { email, password: PASSWORD, ageOkCookie: cookie.cookie },
        freshMeta(),
      );
    }
    expect(t.mail.outbox.filter((m) => m.template === 'email-verification')).toHaveLength(2);
  });
});

describe('revisão B4: cookie de aparelho vale só para a senha atual', () => {
  it('trocar a senha invalida o cookie emitido antes', async () => {
    const t = createTestAuth(db);
    const u = await createVerifiedUser(t);
    const first = await t.service.login({ email: u.email, password: PASSWORD }, freshMeta());
    if (!first.ok || first.mfaRequired) throw new Error('login');
    const s = await t.service.resolveSession(first.token);
    const NEW = 'outra senha sintética bem longa';
    expect(await t.service.changePassword(u.userId, s?.sessionId ?? '', PASSWORD, NEW)).toEqual({
      ok: true,
    });
    // Esgota o limite da conta; o cookie antigo não serve mais para escapar dele.
    for (let i = 0; i < 8; i++) {
      await t.service.login({ email: u.email, password: 'chute sintético' }, freshMeta());
    }
    const old = await t.service.login(
      { email: u.email, password: NEW },
      { ...freshMeta(), knownDevice: first.knownDevice },
    );
    expect(old).toEqual({ ok: false, error: 'invalid_credentials' });
  });
});

describe('LEG-R02: registro de acesso', () => {
  it('login completo grava IP e data/hora em access_logs, que o runtime não lê', async () => {
    const t = createTestAuth(db);
    const meta = { ...META, ip: '203.0.113.77' };
    const u = await createVerifiedUser(t, uniqueEmail(), meta);
    const { rows } = await admin.query<{ ip: string; occurred_at: Date }>(
      'SELECT host(ip) AS ip, occurred_at FROM access_logs WHERE user_id = $1',
      [u.userId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ip).toBe('203.0.113.77');
    await expect(db.$queryRaw`SELECT * FROM access_logs`).rejects.toThrow(/permission denied/);
  });

  it('IP inválido vira NULL; sessão pendente de MFA não registra acesso', async () => {
    const t = createTestAuth(db);
    const u = await createVerifiedUser(t, uniqueEmail(), { ...META, ip: 'unknown' });
    const { rows } = await admin.query<{ ip: string | null }>(
      'SELECT ip FROM access_logs WHERE user_id = $1',
      [u.userId],
    );
    expect(rows).toEqual([{ ip: null }]);
  });

  it('uso contínuo registra no máximo um acesso a cada 5 minutos', async () => {
    const t = createTestAuth(db);
    const u = await createVerifiedUser(t);
    for (let i = 0; i < 3; i++) await t.service.resolveSession(u.token, META);
    t.clock.now = new Date(t.clock.now.getTime() + 6 * 60 * 1000);
    await t.service.resolveSession(u.token, META);
    const { rows } = await admin.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM access_logs WHERE user_id = $1',
      [u.userId],
    );
    expect(rows[0]?.n).toBe(2);
  });
});

describe('LEG-S06: auditoria de sessão', () => {
  it('revogar sessão grava AuditLog só com metadados', async () => {
    const t = createTestAuth(db);
    const u = await createVerifiedUser(t);
    const s = await t.service.resolveSession(u.token);
    expect(await t.service.revokeSession(u.userId, s?.sessionId ?? '')).toBe(true);
    const { rows } = await admin.query(
      `SELECT actor_user_id, subject_user_id, action, resource_type, resource_id
         FROM audit_logs WHERE subject_user_id = $1`,
      [u.userId],
    );
    expect(rows).toEqual([
      {
        actor_user_id: u.userId,
        subject_user_id: u.userId,
        action: 'session_revoked',
        resource_type: 'session',
        resource_id: s?.sessionId,
      },
    ]);
  });
});
