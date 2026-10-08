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
pnpm mail:up            # Mailpit: caixa de e-mail local em http://localhost:8025
pnpm db:migrate         # aplica as migrações como app_migrator (tabelas, RLS, funções)
pnpm db:verify-roles    # confirma papéis, privilégios, RLS e funções SECURITY DEFINER (LEG-S03)
pnpm dev                # http://localhost:3000 (crie a conta em /cadastro)
```
As senhas do `.env` só valem na primeira criação do volume. Para recriar o banco: `docker compose down -v`.

## E-mails em desenvolvimento (Mailpit)
Com `APP_ENV=development`, os e-mails do app (verificação de cadastro, redefinição de senha, alertas de
segurança) são entregues por SMTP ao **Mailpit** local, uma caixa de e-mail falsa (ADR-0023):

1. `pnpm mail:up` (ou `docker compose up -d mailpit`).
2. Cadastre-se em http://localhost:3000/cadastro com um e-mail inventado (ex.: `ana@exemplo.test`). Nada sai
   da máquina: qualquer endereço serve e nenhum e-mail real é enviado.
3. Abra http://localhost:8025, clique na mensagem e use o link `url:` para confirmar a conta.

Detalhes:
- SMTP em `127.0.0.1:1025` e interface em `127.0.0.1:8025`, só na sua máquina. Para outra porta SMTP, mude
  `DEV_SMTP_PORT` no `.env` (o docker-compose usa o mesmo valor). `DEV_SMTP_HOST` só aceita host local.
- As mensagens ficam só na memória do contêiner (até 200) e somem ao pará-lo: `docker compose stop mailpit`.
- O texto é simplificado (modelo + parâmetros, como o link). O texto final vem do provedor real (Fase 7).
- Os links trazem tokens de uso único: ficam só no Mailpit. O log do servidor mostra apenas `mail.sent`,
  o modelo e o destinatário mascarado.
- Mailpit desligado não quebra o cadastro: o log mostra `mail.dev_smtp_unavailable` e a mensagem se perde.
  Nesse caso, confirme a conta com `UPDATE users SET email_verified_at = now() WHERE email = '...'` como
  `app_migrator` (dados sintéticos), ou suba o Mailpit e peça "reenviar".
- Testes (`APP_ENV=test`) continuam sem envio: as mensagens ficam em memória para os testes lerem.

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
