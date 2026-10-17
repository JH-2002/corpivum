#!/bin/sh
# Papel do LIVRO DE REAPLICAÇÃO dos backups (ADR-0040, revisão M3 da 7e):
#   app_backup: LOGIN, sem BYPASSRLS, não é dono de nada, não pertence a nenhum papel e não lê tabela nenhuma.
#   Recebe da migração `fase_7e_revisao` só o EXECUTE de `app.restore_ledger` (ids e estado das contas e provas,
#   sem e-mail nem dado de saúde), para o `pnpm backup:ledger` agendado e o `--source` da restauração não
#   precisarem da credencial do dono (app_migrator).
# Roda sozinho na criação do volume. Idempotente: num volume que já existe, rode `pnpm db:backup:init`.
set -eu

: "${APP_BACKUP_PASSWORD:?defina APP_BACKUP_PASSWORD no .env}"
app_db="${APP_DB_NAME:-healthmind}"
test_db="${APP_TEST_DB_NAME:-${app_db}_test}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v backup_password="$APP_BACKUP_PASSWORD" -v app_db="$app_db" -v test_db="$test_db" <<'SQL'
SELECT 'CREATE ROLE app_backup LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT'
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_backup')
\gexec
ALTER ROLE app_backup WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT
  PASSWORD :'backup_password';
SELECT format('GRANT CONNECT ON DATABASE %I TO app_backup', datname)
  FROM pg_database WHERE datname IN (:'app_db', :'test_db')
\gexec
SQL

echo "papel app_backup pronto"
