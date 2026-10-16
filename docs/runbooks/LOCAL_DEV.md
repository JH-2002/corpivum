# Runbook — Ambiente de desenvolvimento local

## Pré-requisitos
- Node 24 (`.nvmrc`), pnpm 12 (`packageManager` no `package.json`), Docker.

## Primeira vez
```sh
pnpm install
cp .env.example .env
# edite .env: troque "troque-localmente" por senhas locais e gere QUATRO valores diferentes
# (KMS_LOCAL_MASTER_KEY, SESSION_SECRET, RATE_LIMIT_SECRET, RECOVERY_CODE_PEPPER), cada um com:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
pnpm db:up              # Postgres 17 em 127.0.0.1 (cria app_migrator, app_user, healthmind e healthmind_test)
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
`test:db` e `test:e2e` usam **só o banco de testes** `healthmind_test` (`TEST_DATABASE_URL` e
`TEST_MIGRATION_DATABASE_URL` no `.env`), aplicam as migrações nele e apagam as tabelas dele a cada rodada.
O banco de desenvolvimento (`healthmind`) não é tocado: os testes recusam rodar se a URL de teste não
terminar em `_test` ou apontar para o banco de desenvolvimento (ADR-0024). O e2e usa contas no domínio
reservado `e2e.exemplo.test`.

### Banco de testes num volume criado antes da ADR-0024
O banco `healthmind_test` é criado sozinho quando o volume do Postgres é novo. Num volume que já existe:
```sh
pnpm db:test:init       # cria healthmind_test com os mesmos papéis e privilégios (idempotente)
```
e acrescente ao `.env` (mesmo usuário e senha das URLs de desenvolvimento, só troca o banco):
```sh
APP_TEST_DB_NAME=healthmind_test
TEST_DATABASE_URL=postgresql://app_user:<senha>@localhost:<porta>/healthmind_test
TEST_MIGRATION_DATABASE_URL=postgresql://app_migrator:<senha>@localhost:<porta>/healthmind_test
```

### Papel `app_operator` num volume criado antes da Fase 6b
A migração `fase_6b_direitos` falha se o papel do atendimento manual (ADR-0034) não existir. Num volume novo ele
é criado sozinho (`docker/postgres/init/03-operator-role.sh`). Num volume que já existe, acrescente ao `.env`:
```sh
APP_OPERATOR_PASSWORD=<senha nova>
OPERATOR_DATABASE_URL=postgresql://app_operator:<senha nova>@localhost:<porta>/healthmind
TEST_OPERATOR_DATABASE_URL=postgresql://app_operator:<senha nova>@localhost:<porta>/healthmind_test
```
e rode:
```sh
docker compose up -d --wait db   # recria o contêiner com a variável nova; o volume continua
pnpm db:operator:init            # cria o papel e dá CONNECT nos dois bancos (idempotente)
pnpm db:deploy
```

### Papéis `app_worker` e `operador_dev` num volume criado antes da Fase 7b
A migração `fase_7b_papeis` falha se o papel dos jobs (ADR-0037) não existir. Na 7b, `app_operator` vira grupo
sem login e quem atende entra com o próprio papel (`operador_dev` em desenvolvimento). Num volume que já existe,
acrescente ao `.env` (e troque o usuário das URLs do operador):
```sh
APP_WORKER_PASSWORD=<senha nova>
WORKER_DATABASE_URL=postgresql://app_worker:<senha nova>@localhost:<porta>/healthmind
TEST_WORKER_DATABASE_URL=postgresql://app_worker:<senha nova>@localhost:<porta>/healthmind_test
OPERATOR_DATABASE_URL=postgresql://operador_dev:<senha do operador>@localhost:<porta>/healthmind
TEST_OPERATOR_DATABASE_URL=postgresql://operador_dev:<senha do operador>@localhost:<porta>/healthmind_test
RECOVERY_CODE_PEPPER=<valor novo de 32 bytes em base64>
```
e rode:
```sh
docker compose up -d --wait db   # recria o contêiner com a variável nova; o volume continua
pnpm db:operator:init            # grupo app_operator sem login e papel operador_dev (idempotente)
pnpm db:worker:init              # papel app_worker, membro do app_user (idempotente)
pnpm db:deploy
```
Com o pepper novo, os códigos de recuperação de contas de desenvolvimento com MFA deixam de valer: gere outros.

### Migração da branch alterada depois de aplicada
Se uma função de uma migração **da branch em curso** muda depois de aplicada, o `prisma migrate dev` acusa
checksum diferente e oferece apagar o banco. Em vez disso:
```sh
pnpm db:resync-migration <pasta_da_migracao> <funcao> [<funcao>...]
# ex.: pnpm db:resync-migration 20261016160000_fase_7b_revisao exports_mark_file_deleted
```
O script recria só os blocos `CREATE [OR REPLACE] FUNCTION app.<funcao>` daquele arquivo e grava o checksum novo
em `_prisma_migrations`, no banco de desenvolvimento e no de testes, como `app_migrator`; recusa host que não seja
local. Serve só para funções: mudança de tabela, política ou GRANT pede `docker compose down -v` ou migração nova.
Migração que já está na `main` nunca muda: a correção vira migração nova.

O `.gitattributes` força LF em `prisma/migrations/**` e `*.sql`, porque o checksum é do arquivo como está e CRLF
no Windows o mudaria. Se um arquivo de migração ficou com CRLF de antes da regra:
`git add --renormalize prisma/migrations` e `git checkout -- prisma/migrations`.

O `pnpm db:seed` grava no banco de **desenvolvimento** (é para usar o app logado com dados sintéticos).

## Regras
- **Somente dados sintéticos.** Nunca use dados reais, nem os seus (CLAUDE.md regra 6).
- Nunca commitar `.env`, chaves ou dumps de banco.
- Para ver um estado de tela: `?state=loading|error|no-data|partial` (desligado em produção).
- Logs: use `logger` de `src/lib/logger.ts`; ele só aceita metadados (LEG-R04).
