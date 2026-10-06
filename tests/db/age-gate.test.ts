import type pg from 'pg';
import type { AgeSignalProvider } from '@/adapters/age-signal/types';
import type { Db } from '@/lib/db/client';
import {
  META,
  PASSWORD,
  connectAdmin,
  createTestAuth,
  rowCounts,
  runtimeDb,
  truncateAll,
} from './helpers';

/** LEG-F01 / LEG-F03: menor de 18 não gera linha em nenhuma tabela, nem log, nem e-mail. */
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

describe('age gate 18+ (LEG-F01)', () => {
  it('menor de 18: nenhuma linha em nenhuma tabela, nenhum log, nenhum e-mail', async () => {
    const t = createTestAuth(db);
    // Aniversário de 18 anos amanhã (no fuso de Brasília).
    t.clock.now = new Date('2026-10-06T15:00:00Z');
    const before = await rowCounts(admin);

    const r = await t.service.checkAge('2008-10-07', new Headers());
    expect(r).toEqual({ outcome: 'minor' });
    // Mesmo tentando seguir para o passo 2 sem o cookie de adulto, nada é criado.
    const reg = await t.service.register(
      { email: 'menor.sintetico@exemplo.test', password: PASSWORD, ageOkCookie: undefined },
      META,
    );
    expect(reg).toEqual({ ok: false, error: 'age_required' });

    expect(await rowCounts(admin)).toEqual(before);
    expect(t.logs).toEqual([]);
    expect(t.mail.outbox).toEqual([]);
  });

  it('a resposta do passo 1 não carrega a data informada', async () => {
    const t = createTestAuth(db);
    const minor = await t.service.checkAge('2012-03-04', new Headers());
    const adult = await t.service.checkAge('1990-03-04', new Headers());
    expect(JSON.stringify(minor)).not.toMatch(/2012|03-04/);
    expect(JSON.stringify(adult)).not.toMatch(/1990|03-04/);
    expect(adult.outcome).toBe('adult');
  });

  it('sinal de idade "minor" da plataforma bloqueia mesmo com data de adulto (LEG-F03)', async () => {
    const minorSignal: AgeSignalProvider = {
      id: 'test',
      getAgeSignal: async () => ({ status: 'minor', source: 'teste' }),
    };
    const t = createTestAuth(db, { ageSignal: minorSignal });
    const before = await rowCounts(admin);
    expect(await t.service.checkAge('1990-01-01', new Headers())).toEqual({ outcome: 'minor' });
    expect(await rowCounts(admin)).toEqual(before);
  });

  it('data inválida não grava nada', async () => {
    const t = createTestAuth(db);
    const before = await rowCounts(admin);
    expect(await t.service.checkAge('2000-13-40', new Headers())).toEqual({ outcome: 'invalid' });
    expect(await rowCounts(admin)).toEqual(before);
    expect(t.logs).toEqual([]);
  });

  it('cookie de adulto forjado ou de outro segredo não libera o cadastro', async () => {
    const t = createTestAuth(db);
    const other = createTestAuth(db);
    const forged = await other.service.checkAge('1990-01-01', new Headers());
    if (forged.outcome !== 'adult') throw new Error('age');
    const before = await rowCounts(admin);
    for (const cookie of [forged.cookie, 'v1.9999999999.' + 'A'.repeat(43), 'qualquer']) {
      const r = await t.service.register(
        { email: 'forjado@exemplo.test', password: PASSWORD, ageOkCookie: cookie },
        META,
      );
      expect(r).toEqual({ ok: false, error: 'age_required' });
    }
    expect(await rowCounts(admin)).toEqual(before);
  });
});
