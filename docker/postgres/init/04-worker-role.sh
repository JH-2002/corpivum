#!/bin/sh
# Papel dos JOBS em segundo plano (ADR-0036 D5, ADR-0037; PR1b-B3, PR1b-M1 residual, P7-N6):
#   app_worker: LOGIN, sem BYPASSRLS, não é dono de nada. Herda os privilégios de tabela do app_user (os jobs
#   por pessoa rodam com `app.user_id`, sujeitos ao RLS) e é o ÚNICO que executa as funções de varredura e
#   retenção (expurgos, listas de vencidos, fila de jobs, purga de conta), concedidas pela migração
#   `fase_7b_papeis`. O app_user (web) deixa de executá-las.
# Roda sozinho na criação do volume. Idempotente: num volume que já existe, rode `pnpm db:worker:init`.
set -eu

: "${APP_WORKER_PASSWORD:?defina APP_WORKER_PASSWORD no .env}"
app_db="${APP_DB_NAME:-healthmind}"
test_db="${APP_TEST_DB_NAME:-${app_db}_test}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v worker_password="$APP_WORKER_PASSWORD" -v app_db="$app_db" -v test_db="$test_db" <<'SQL'
SELECT 'CREATE ROLE app_worker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT'
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_worker')
\gexec
ALTER ROLE app_worker WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT
  PASSWORD :'worker_password';
-- Membro do app_user (herda tabelas e funções por pessoa); o contrário nunca: o app_user continua sem
-- pertencer a nenhum papel (conferido em `pnpm db:verify-roles`).
GRANT app_user TO app_worker WITH INHERIT TRUE, SET FALSE;
SELECT format('GRANT CONNECT, TEMPORARY ON DATABASE %I TO app_worker', datname)
  FROM pg_database WHERE datname IN (:'app_db', :'test_db')
\gexec
SQL

echo "papel app_worker pronto"
