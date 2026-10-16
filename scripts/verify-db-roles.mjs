// Verifica a configuração de papéis do Postgres (LEG-S03).
// Uso: pnpm db:up && pnpm db:verify-roles
// Imprime apenas o nome de cada checagem e o resultado; nunca credenciais ou dados.
import 'dotenv/config';
import pg from 'pg';

const migratorUrl = process.env.MIGRATION_DATABASE_URL;
const userUrl = process.env.DATABASE_URL;
// Opcionais: conexões do atendimento manual (ADR-0034/0037) e dos jobs (ADR-0037), conferidas se definidas.
const operatorUrl = process.env.OPERATOR_DATABASE_URL;
const workerUrl = process.env.WORKER_DATABASE_URL;
if (!migratorUrl || !userUrl) {
  console.error('MIGRATION_DATABASE_URL e DATABASE_URL precisam estar definidos.');
  process.exit(1);
}

const results = [];
const check = (name, ok) => results.push({ name, ok: Boolean(ok) });

const migrator = new pg.Client({ connectionString: migratorUrl });
const runtime = new pg.Client({ connectionString: userUrl });

try {
  await migrator.connect();
  await runtime.connect();

  const { rows: roles } = await migrator.query(
    `SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolcanlogin
       FROM pg_roles WHERE rolname IN ('app_user', 'app_migrator', 'app_operator', 'app_worker')`,
  );
  const appUser = roles.find((r) => r.rolname === 'app_user');
  const appMigrator = roles.find((r) => r.rolname === 'app_migrator');
  const appOperator = roles.find((r) => r.rolname === 'app_operator');
  const appWorker = roles.find((r) => r.rolname === 'app_worker');

  check('app_user existe', appUser);
  check('app_user não é superusuário', appUser && !appUser.rolsuper);
  check('app_user sem BYPASSRLS', appUser && !appUser.rolbypassrls);
  check(
    'app_user sem CREATEDB/CREATEROLE',
    appUser && !appUser.rolcreatedb && !appUser.rolcreaterole,
  );
  check('app_migrator existe', appMigrator);
  check('app_migrator não é superusuário', appMigrator && !appMigrator.rolsuper);
  check('app_migrator sem BYPASSRLS', appMigrator && !appMigrator.rolbypassrls);
  // Fase 6b (ADR-0034): atendimento manual de pedidos do titular.
  check('app_operator existe', appOperator);
  check('app_operator não é superusuário', appOperator && !appOperator.rolsuper);
  check('app_operator sem BYPASSRLS', appOperator && !appOperator.rolbypassrls);
  check(
    'app_operator sem CREATEDB/CREATEROLE',
    appOperator && !appOperator.rolcreatedb && !appOperator.rolcreaterole,
  );
  // ADR-0037: app_operator é só grupo; quem atende entra com o próprio papel de login.
  check('app_operator é grupo (NOLOGIN)', appOperator && !appOperator.rolcanlogin);
  // ADR-0036 D5 / ADR-0037: jobs em segundo plano.
  check('app_worker existe', appWorker);
  check('app_worker não é superusuário', appWorker && !appWorker.rolsuper);
  check('app_worker sem BYPASSRLS', appWorker && !appWorker.rolbypassrls);
  check(
    'app_worker sem CREATEDB/CREATEROLE',
    appWorker && !appWorker.rolcreatedb && !appWorker.rolcreaterole,
  );
  const { rows: workerOf } = await migrator.query(
    `SELECT coalesce(array_agg(pg_get_userbyid(roleid)::text ORDER BY 1), '{}') AS r
       FROM pg_auth_members WHERE member = 'app_worker'::regrole`,
  );
  check('app_worker só é membro do app_user', (workerOf[0]?.r ?? []).join(',') === 'app_user');

  // NOINHERIT não impede SET ROLE: app_user não pode ser membro de nenhum outro papel.
  const { rows: memberships } = await migrator.query(
    `SELECT count(*)::int AS n FROM pg_auth_members WHERE member = 'app_user'::regrole`,
  );
  check('app_user não é membro de outros papéis', memberships[0]?.n === 0);
  const { rows: opMemberships } = await migrator.query(
    `SELECT count(*)::int AS n FROM pg_auth_members WHERE member = 'app_operator'::regrole`,
  );
  check('app_operator fora de outros papéis', opMemberships[0]?.n === 0);
  // Membros do grupo: papéis de login de pessoas, sem atributos e sem pertencer a outro papel.
  const { rows: opPeople } = await migrator.query(
    `SELECT r.rolname, r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole AS power,
            (SELECT count(*) FROM pg_auth_members o WHERE o.member = r.oid)::int AS groups
       FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member
      WHERE m.roleid = 'app_operator'::regrole`,
  );
  check(
    'membros do app_operator são operador_<nome>, sem atributos e só nesse grupo',
    opPeople.every((r) => /^operador_[a-z0-9_]+$/.test(r.rolname) && !r.power && r.groups === 1),
  );
  const { rows: opTables } = await migrator.query(
    `SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm')
        AND has_table_privilege('app_operator', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')`,
  );
  check('app_operator sem acesso a nenhuma tabela', opTables[0]?.n === 0);
  const { rows: opPublic } = await migrator.query(
    `SELECT has_schema_privilege('app_operator', 'public', 'USAGE,CREATE') AS any`,
  );
  check('app_operator sem USAGE/CREATE em public', opPublic[0] && !opPublic[0].any);
  const { rows: opFunctions } = await migrator.query(
    `SELECT coalesce(array_agg(p.proname::text ORDER BY p.proname), '{}') AS names
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app' AND has_function_privilege('app_operator', p.oid, 'EXECUTE')`,
  );
  check(
    'app_operator executa só app.operator_*',
    (opFunctions[0]?.names ?? []).join(',') ===
      'operator_account_delete,operator_request_close,operator_request_contact,' +
        'operator_request_register,operator_requests_due,operator_role',
  );

  const { rows: owners } = await migrator.query(
    `SELECT pg_get_userbyid(d.datdba) AS db_owner,
            pg_get_userbyid(n.nspowner) AS schema_owner,
            has_schema_privilege('app_user', 'public', 'CREATE') AS user_can_create,
            has_schema_privilege('app_user', 'public', 'USAGE') AS user_can_use
       FROM pg_database d, pg_namespace n
      WHERE d.datname = current_database() AND n.nspname = 'public'`,
  );
  const o = owners[0];
  check('banco pertence ao app_migrator', o?.db_owner === 'app_migrator');
  check('schema public pertence ao app_migrator', o?.schema_owner === 'app_migrator');
  check('app_user não cria objetos em public', o && !o.user_can_create);
  check('app_user tem USAGE em public', o?.user_can_use);

  // Privilégios padrão: tabela criada pelo migrator dá só DML ao app_user. Tudo em transação revertida.
  await migrator.query('BEGIN');
  await migrator.query('CREATE TABLE public._role_probe (id int)');
  const { rows: privs } = await migrator.query(
    `SELECT pg_get_userbyid(c.relowner) AS owner,
            has_table_privilege('app_user', 'public._role_probe', 'SELECT,INSERT,UPDATE,DELETE') AS dml,
            has_table_privilege('app_user', 'public._role_probe', 'TRUNCATE') AS truncate,
            has_table_privilege('app_user', 'public._role_probe', 'REFERENCES') AS refs
       FROM pg_class c WHERE c.oid = 'public._role_probe'::regclass`,
  );
  await migrator.query('ROLLBACK');
  const p = privs[0];
  check('tabelas novas pertencem ao app_migrator', p?.owner === 'app_migrator');
  check('app_user recebe DML nas tabelas novas', p?.dml);
  check('app_user sem TRUNCATE/REFERENCES', p && !p.truncate && !p.refs);

  // O runtime não pode criar tabelas.
  let createDenied = false;
  try {
    await runtime.query('CREATE TABLE public._runtime_probe (id int)');
    await runtime.query('DROP TABLE public._runtime_probe');
  } catch (error) {
    createDenied = error?.code === '42501';
  }
  check('conexão de runtime não consegue CREATE TABLE', createDenied);

  // Fase 1a (ADR-0015): toda tabela de public tem RLS; a de migrações fica fora do alcance do runtime.
  const { rows: tables } = await migrator.query(
    `SELECT c.relname, c.relrowsecurity AS rls
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'`,
  );
  const appTables = tables.filter((t) => t.relname !== '_prisma_migrations');
  if (appTables.length > 0) {
    check(
      'toda tabela da aplicação tem RLS habilitado',
      appTables.every((t) => t.rls),
    );
  }
  if (tables.some((t) => t.relname === '_prisma_migrations')) {
    const { rows: mig } = await migrator.query(
      `SELECT has_table_privilege('app_user', 'public._prisma_migrations',
              'SELECT,INSERT,UPDATE,DELETE') AS any`,
    );
    check('app_user sem acesso a _prisma_migrations', mig[0] && !mig[0].any);
  }
  const { rows: definers } = await migrator.query(
    `SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c
                         WHERE c LIKE 'search_path=%')`,
  );
  check('funções SECURITY DEFINER com search_path fixo', definers[0]?.n === 0);
  // ADR-0037 (D5): varreduras, expurgos, fila e purga só no app_worker; o runtime web não executa nenhuma.
  const { rows: sweeps } = await migrator.query(
    `SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app'
        AND p.proname IN ('auth_purge_expired', 'account_purge', 'account_purge_due', 'jobs_claim',
                          'jobs_complete', 'jobs_fail', 'exports_cleanup_due', 'exports_purge_rows',
                          'privacy_purge_access_logs', 'privacy_purge_proofs', 'privacy_purge_reauth_proofs',
                          'privacy_due_health_eliminations', 'privacy_request_deadlines',
                          'onboarding_expiry_notices_due', 'onboarding_expiry_notice_mark',
                          'onboarding_expired_purge', 'reminders_active')
        AND has_function_privilege('app_user', p.oid, 'EXECUTE')`,
  );
  check('app_user não executa varreduras nem purgas (só app_worker)', sweeps[0]?.n === 0);

  const { rows: who } = await runtime.query('SELECT current_user AS u');
  check('DATABASE_URL conecta como app_user', who[0]?.u === 'app_user');

  if (operatorUrl) {
    const operator = new pg.Client({ connectionString: operatorUrl });
    try {
      await operator.connect();
      const { rows: op } = await operator.query(
        `SELECT current_user AS u, pg_has_role(current_user, 'app_operator', 'MEMBER') AS member`,
      );
      check(
        'OPERATOR_DATABASE_URL conecta com operador_<nome> do grupo app_operator',
        /^operador_/.test(op[0]?.u ?? '') && op[0]?.member,
      );
    } finally {
      await operator.end().catch(() => {});
    }
  }
  if (workerUrl) {
    const worker = new pg.Client({ connectionString: workerUrl });
    try {
      await worker.connect();
      const { rows: wk } = await worker.query('SELECT current_user AS u');
      check('WORKER_DATABASE_URL conecta como app_worker', wk[0]?.u === 'app_worker');
    } finally {
      await worker.end().catch(() => {});
    }
  }
} catch (error) {
  console.error(`Falha ao verificar papéis: ${error?.code ?? error?.name ?? 'erro desconhecido'}`);
  process.exitCode = 1;
} finally {
  await migrator.end().catch(() => {});
  await runtime.end().catch(() => {});
}

for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}`);
if (results.length === 0 || results.some((r) => !r.ok)) process.exitCode = 1;
