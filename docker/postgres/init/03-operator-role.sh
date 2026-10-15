#!/bin/sh
# Papel do ATENDIMENTO MANUAL de pedidos do titular (ADR-0034, LEG-D07):
#   app_operator: LOGIN, sem BYPASSRLS, não é dono de nada e sem acesso a tabelas. Só executa as três
#   funções `app.operator_*` concedidas pela migração `fase_6b_direitos`.
# Roda sozinho na criação do volume. Idempotente: num volume que já existe, rode `pnpm db:operator:init`.
set -eu

: "${APP_OPERATOR_PASSWORD:?defina APP_OPERATOR_PASSWORD no .env}"
app_db="${APP_DB_NAME:-healthmind}"
test_db="${APP_TEST_DB_NAME:-${app_db}_test}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v operator_password="$APP_OPERATOR_PASSWORD" -v app_db="$app_db" -v test_db="$test_db" <<'SQL'
SELECT 'CREATE ROLE app_operator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT'
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_operator')
\gexec
ALTER ROLE app_operator WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT
  PASSWORD :'operator_password';
SELECT format('GRANT CONNECT ON DATABASE %I TO app_operator', datname)
  FROM pg_database WHERE datname IN (:'app_db', :'test_db')
\gexec
SQL

echo "papel app_operator pronto"
