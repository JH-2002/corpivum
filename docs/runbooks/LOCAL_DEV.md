# Runbook — Ambiente de desenvolvimento local

## Pré-requisitos
- Node 24 (`.nvmrc`), pnpm 12 (`packageManager` no `package.json`), Docker.

## Primeira vez
```sh
pnpm install
cp .env.example .env
# edite .env: troque "troque-localmente" por senhas locais e gere TRÊS valores diferentes
# (KMS_LOCAL_MASTER_KEY, SESSION_SECRET, RATE_LIMIT_SECRET), cada um com:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
pnpm db:up              # Postgres 17 em 127.0.0.1 (cria app_migrator e app_user)
pnpm db:migrate         # aplica as migrações como app_migrator (tabelas, RLS, funções)
pnpm db:verify-roles    # confirma papéis, privilégios, RLS e funções SECURITY DEFINER (LEG-S03)
pnpm dev                # http://localhost:3000 (crie a conta em /cadastro)
```
As senhas do `.env` só valem na primeira criação do volume. Para recriar o banco: `docker compose down -v`.

O e-mail de verificação não é enviado em dev: o `ConsoleMailProvider` só registra o template e o destinatário
mascarado. Para confirmar uma conta local, use `UPDATE users SET email_verified_at = now() WHERE email = '...'`
como `app_migrator` (dados sintéticos).

## Antes de commitar
```sh
pnpm lint && pnpm typecheck && pnpm test
pnpm test:db            # integração com Postgres: RLS, sessões, MFA, limites, age gate (exige db:up)
pnpm test:e2e           # Playwright + axe (instale o navegador uma vez: pnpm exec playwright install chromium)
```
**Atenção:** `test:db` e `test:e2e` apagam dados das tabelas de auth do banco do `.env` (só há dados
sintéticos em dev). O e2e usa contas no domínio reservado `e2e.exemplo.test`.

## Regras
- **Somente dados sintéticos.** Nunca use dados reais, nem os seus (CLAUDE.md regra 6).
- Nunca commitar `.env`, chaves ou dumps de banco.
- Para ver um estado de tela: `?state=loading|error|no-data|partial` (desligado em produção).
- Logs: use `logger` de `src/lib/logger.ts`; ele só aceita metadados (LEG-R04).
