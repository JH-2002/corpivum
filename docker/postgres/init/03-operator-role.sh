#!/bin/sh
# ATENDIMENTO MANUAL de pedidos do titular (ADR-0034, ADR-0036 D5, ADR-0037; LEG-D07, LEG-S06, OI-34 b):
#   app_operator: GRUPO (NOLOGIN), sem BYPASSRLS, não é dono de nada e sem acesso a tabelas. Recebe das
#     migrações só o EXECUTE das funções `app.operator_*`.
#   operador_dev: papel de LOGIN de UMA pessoa (aqui, quem desenvolve), membro do grupo. Cada função grava o
#     `session_user` no AuditLog, então cada pessoa que atende tem o próprio papel (produção: runbook
#     docs/runbooks/DATA_SUBJECT_REQUEST.md, papéis `operador_<nome>`).
# Roda sozinho na criação do volume. Idempotente: num volume que já existe, rode `pnpm db:operator:init`.
set -eu

: "${APP_OPERATOR_PASSWORD:?defina APP_OPERATOR_PASSWORD no .env}"
app_db="${APP_DB_NAME:-healthmind}"
test_db="${APP_TEST_DB_NAME:-${app_db}_test}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v operator_password="$APP_OPERATOR_PASSWORD" -v app_db="$app_db" -v test_db="$test_db" <<'SQL'
SELECT 'CREATE ROLE app_operator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT'
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_operator')
\gexec
-- Volumes antigos (Fase 6b): o grupo deixa de entrar no banco e perde a senha.
ALTER ROLE app_operator WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT
  PASSWORD NULL;

SELECT 'CREATE ROLE operador_dev LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT'
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'operador_dev')
\gexec
ALTER ROLE operador_dev WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT
  PASSWORD :'operator_password';
GRANT app_operator TO operador_dev WITH INHERIT TRUE, SET FALSE;

SELECT format('REVOKE CONNECT ON DATABASE %I FROM app_operator', datname)
  FROM pg_database WHERE datname IN (:'app_db', :'test_db')
\gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO operador_dev', datname)
  FROM pg_database WHERE datname IN (:'app_db', :'test_db')
\gexec
SQL

echo "grupo app_operator e papel operador_dev prontos"
