# Runbook — Ambiente de desenvolvimento local

## Pré-requisitos
- Node 24 (`.nvmrc`), pnpm 12 (`packageManager` no `package.json`), Docker.

## Primeira vez
```sh
pnpm install
cp .env.example .env
# edite .env: troque "troque-localmente" por senhas locais e gere a chave do KMS local:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
pnpm db:up              # Postgres 17 em 127.0.0.1 (cria app_migrator e app_user)
pnpm db:verify-roles    # confirma papéis e privilégios (LEG-S03)
pnpm dev                # http://localhost:3000
```
As senhas do `.env` só valem na primeira criação do volume. Para recriar o banco: `docker compose down -v`.

## Antes de commitar
```sh
pnpm lint && pnpm typecheck && pnpm test
pnpm test:e2e           # Playwright + axe (instale o navegador uma vez: pnpm exec playwright install chromium)
```

## Regras
- **Somente dados sintéticos.** Nunca use dados reais, nem os seus (CLAUDE.md regra 6).
- Nunca commitar `.env`, chaves ou dumps de banco.
- Para ver um estado de tela: `?state=loading|error|no-data|partial` (desligado em produção).
- Logs: use `logger` de `src/lib/logger.ts`; ele só aceita metadados (LEG-R04).
