// Verifica a configuração de papéis do Postgres (LEG-S03).
// Uso: pnpm db:up && pnpm db:verify-roles
// Imprime apenas o nome de cada checagem e o resultado; nunca credenciais ou dados.
import 'dotenv/config';
import pg from 'pg';

const migratorUrl = process.env.MIGRATION_DATABASE_URL;
const userUrl = process.env.DATABASE_URL;
// Opcional: conexão do atendimento manual (ADR-0034), conferida só se definida.
const operatorUrl = process.env.OPERATOR_DATABASE_URL;
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
    `SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
       FROM pg_roles WHERE rolname IN ('app_user', 'app_migrator', 'app_operator')`,
  );
  const appUser = roles.find((r) => r.rolname === 'app_user');
  const appMigrator = roles.find((r) => r.rolname === 'app_migrator');
  const appOperator = roles.find((r) => r.rolname === 'app_operator');

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

  // NOINHERIT não impede SET ROLE: app_user não pode ser membro de nenhum outro papel.
  const { rows: memberships } = await migrator.query(
    `SELECT count(*)::int AS n FROM pg_auth_members WHERE member = 'app_user'::regrole`,
  );
  check('app_user não é membro de outros papéis', memberships[0]?.n === 0);
  const { rows: opMemberships } = await migrator.query(
    `SELECT count(*)::int AS n FROM pg_auth_members
      WHERE member = 'app_operator'::regrole OR roleid = 'app_operator'::regrole`,
  );
  check('app_operator fora de outros papéis', opMemberships[0]?.n === 0);
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
      'operator_request_close,operator_request_contact,operator_requests_due',
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

  const { rows: who } = await runtime.query('SELECT current_user AS u');
  check('DATABASE_URL conecta como app_user', who[0]?.u === 'app_user');

  if (operatorUrl) {
    const operator = new pg.Client({ connectionString: operatorUrl });
    try {
      await operator.connect();
      const { rows: op } = await operator.query('SELECT current_user AS u');
      check('OPERATOR_DATABASE_URL conecta como app_operator', op[0]?.u === 'app_operator');
    } finally {
      await operator.end().catch(() => {});
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
