#!/bin/sh
# Cria os papéis da aplicação (LEG-S03, CLAUDE.md "Prisma + RLS"):
#   app_migrator: dono do banco e das tabelas; usado SÓ para migrações.
#   app_user:     papel de runtime; não é dono de nada, sem BYPASSRLS, só DML.
# Roda uma única vez, na criação do volume, como superusuário do container.
set -eu

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname postgres \
  -v db_name="$APP_DB_NAME" \
  -v migrator_password="$APP_MIGRATOR_PASSWORD" \
  -v user_password="$APP_USER_PASSWORD" <<'SQL'
-- CREATEDB só em dev: `prisma migrate dev` precisa criar o shadow database.
CREATE ROLE app_migrator LOGIN PASSWORD :'migrator_password'
  NOSUPERUSER CREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

CREATE ROLE app_user LOGIN PASSWORD :'user_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;

CREATE DATABASE :"db_name" OWNER app_migrator;
REVOKE ALL ON DATABASE :"db_name" FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE :"db_name" TO app_user;
SQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$APP_DB_NAME" <<'SQL'
-- O schema public passa a pertencer ao app_migrator; app_user só pode usar, não criar objetos.
ALTER SCHEMA public OWNER TO app_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO app_user;

-- Tabelas e sequências criadas pelo app_migrator recebem apenas DML para o app_user.
-- O acesso efetivo às linhas é limitado pelas políticas RLS (Fase 1a).
ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
SQL
