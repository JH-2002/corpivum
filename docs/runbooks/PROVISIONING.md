# Runbook — Provisionamento (tudo no Brasil)

> **RASCUNHO.** Hospedagem, banco, storage e KMS a escolher (OI-11). Requisitos: LEG-S03, LEG-S07, LEG-S10.
> Decisões: ADR-0036 D1 (sem Terraform até a escolha), ADR-0040. Terraform entra depois da escolha
> (CHECKLIST_GO_LIVE) e passa a ser a fonte; até lá, a fonte é `infra/regions.json`.

## Fonte das regiões
`infra/regions.json` declara cada parte do sistema e a região (`pnpm check:infra` na CI):

| Componente | O que é | Região declarada |
|---|---|---|
| `functions` | Servidor web (Next.js), `JOB_WORKER=off` | `gru1` (igual a `APP_REGION`) |
| `worker` | Worker dedicado dos jobs (`WORKER_DEPLOY.md`) | `gru1` |
| `logs` | Logs da plataforma | `gru1` |
| `database` | PostgreSQL gerenciado | `sa-east-1` |
| `backups` | Backups e PITR (`infra/retention.json`) | `sa-east-1` |
| `queue` | Fila `job_queue` no mesmo banco | `sa-east-1` |
| `storage` | Exportações e relatórios cifrados | `sa-east-1` |
| `kms` | Chaves da criptografia de campo | `sa-east-1` |
| `ledgerStorage` | Livros de reaplicação dos backups (só acréscimo) | `sa-east-1` |
| `secrets` | Gerenciador de segredos | `sa-east-1` |

Fora do Brasil só o que está em `outsideBrazil` (e-mail transacional e monitoramento de erros, sem dado de saúde)
e listado em `SUBPROCESSORS.md`. A CI falha se: um componente obrigatório faltar ou sair do Brasil; um componente
novo fora do Brasil não for para `outsideBrazil`; `APP_REGION` divergir de `functions`; a região dos backups não
estiver em `infra/retention.json`; um serviço fora do Brasil não tiver linha em `SUBPROCESSORS.md`.

## Passo a passo (depois da escolha do provedor)
1. **Conferir o arquivo com o provedor:** cada `provider` com o nome real e cada `region` com a região real do
   serviço contratado, inclusive a **execução das funções** e os **logs** (na hospedagem serverless, a região das
   funções é configurada à parte). Mudou algo: ADR + `pnpm check:infra`.
2. **Banco** (`database`, `backups`, `queue`): instância em `sa-east-1`, TLS obrigatório, sem acesso público
   (`{{REDE_PRIVADA}}`), backups cifrados com retenção de `BACKUP_RETENTION_DAYS` (30) e PITR de 7 dias, iguais a
   `infra/retention.json`.
3. **Papéis** (como administrador do provedor, uma vez; mesmos comandos de `docker/postgres/init/`):
   - `01-roles.sh`: `app_migrator` (dono do banco, **sem** `CREATEDB` em produção) e `app_user`;
   - `03-operator-role.sh`: só o grupo `app_operator` (as pessoas: `OPERATOR_CREDENTIALS.md`);
   - `04-worker-role.sh`: `app_worker`;
   - `05-backup-role.sh`: `app_backup` (só lê o livro de reaplicação; usado pelo `backup:ledger` agendado).
   Senhas novas, do gerenciador de segredos `{{SEGREDOS}}`. Depois: `pnpm db:deploy` (como `app_migrator`, de uma
   máquina de operação) e `pnpm db:verify-roles` com as URLs de produção.
4. **Storage** (`storage`): bucket privado em `sa-east-1`, sem acesso público nem URL pública, cifrado, com regra de
   ciclo de vida no prefixo `exports/` de `storage.exportsLifecycleDays` (2 dias, `infra/retention.json`). O
   adaptador real implementa `list` por prefixo (varredura de órfãos, OI-35).
5. **KMS** (`kms`): chave mestra em `sa-east-1`; o adaptador real do `KmsProvider` usa só ela.
6. **Web** (`functions`): `APP_ENV=production`, `JOB_QUEUE=postgres`, `JOB_WORKER=off`, sem `WORKER_DATABASE_URL`,
   `OPERATOR_DATABASE_URL`, `MIGRATION_DATABASE_URL` nem `BACKUP_ENCRYPTION_KEY`; `CLIENT_IP_HEADER` da plataforma.
7. **Worker** (`worker`): `WORKER_DEPLOY.md`.
8. **Logs** (`logs`): retenção da plataforma ≤ `ACCESS_LOG_RETENTION_DAYS`; destino dos alertas (`ALERTS.md`).
9. **Backups do app:** `BACKUP_ENCRYPTION_KEY` no gerenciador de segredos (`secrets`), fora do provedor dos
   backups; livro de reaplicação de hora em hora (`pnpm backup:ledger`, papel `app_backup`) em storage só de
   acréscimo no Brasil (`ledgerStorage`; `BACKUP_RESTORE.md`). Nenhuma das duas credenciais vai para a web ou o
   worker (o `parseEnv` recusa em produção).
10. **Primeiro ensaio de restauração** no provedor (`BACKUP_RESTORE.md`, parte 3) antes do beta, registrado.
