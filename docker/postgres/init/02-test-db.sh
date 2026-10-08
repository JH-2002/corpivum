#!/bin/sh
# Banco SÓ PARA TESTES (ADR-0024): `pnpm test:db` e o e2e apagam tabelas, então nunca usam o banco de
# desenvolvimento. Mesmos papéis e privilégios do banco da aplicação (01-roles.sh, LEG-S03).
# Roda sozinho na criação do volume. Idempotente: num volume que já existe, rode `pnpm db:test:init`.
set -eu

test_db="${APP_TEST_DB_NAME:-${APP_DB_NAME:-healthmind}_test}"
case "$test_db" in
  *_test) ;;
  *) echo "APP_TEST_DB_NAME precisa terminar em _test (recebido: $test_db)" >&2; exit 1 ;;
esac

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres -v db_name="$test_db" <<'SQL'
SELECT format('CREATE DATABASE %I OWNER app_migrator', :'db_name')
 WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db_name')
\gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'db_name') \gexec
SELECT format('GRANT CONNECT, TEMPORARY ON DATABASE %I TO app_user', :'db_name') \gexec
SQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$test_db" <<'SQL'
ALTER SCHEMA public OWNER TO app_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO app_user;

ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
SQL

echo "banco de testes pronto: $test_db"
