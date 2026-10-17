# Runbook — Worker dedicado dos jobs

> **RASCUNHO.** Hospedagem a definir (OI-11): os passos com `{{...}}` dependem dela. Requisitos: LEG-S03, LEG-S10,
> LEG-D04, LEG-R04. Decisões: ADR-0019, ADR-0036 D5, ADR-0037, ADR-0040. Fecha a parte de documentação do OI-14 (a).

## Por que existe
Só o papel `app_worker` executa as varreduras, os expurgos, a fila e a purga de conta (ADR-0037). Essa separação só
vale por inteiro se a credencial dele (`WORKER_DATABASE_URL`) estiver **num processo que não atende o público**: se
uma instância web fosse comprometida com a credencial do worker, o invasor poderia rodar as varreduras e ler as
amostras do alerta de volume (OI-14 a, 7c-R1). Por isso:
- **instâncias web:** `JOB_WORKER=off` e **sem** `WORKER_DATABASE_URL` (o `parseEnv` recusa a combinação em produção);
- **worker:** uma instância do mesmo build com `JOB_WORKER=inline` e `WORKER_DATABASE_URL`, **sem tráfego público**.

## O que é o worker
O mesmo build do app (`pnpm build`), iniciado com `pnpm start`. Na subida, o `register()` do Next liga a guarda do
console, confere a política de retenção e começa a consumir a fila Postgres (`src/server-jobs.ts`). Os jobs
recorrentes usam `singletonKey`, então duas instâncias de worker não duplicam trabalho (a fila usa `SKIP LOCKED`).

## Variáveis de ambiente
| Variável | Web | Worker |
|---|---|---|
| `APP_ENV` | `production` | `production` |
| `APP_REGION` | igual a `functions.region` de `infra/regions.json` | igual a `worker.region` |
| `JOB_QUEUE` | `postgres` | `postgres` |
| `JOB_WORKER` | `off` | `inline` |
| `DATABASE_URL` | `app_user` | `app_user` |
| `WORKER_DATABASE_URL` | **não definir** | `app_worker` |
| `OPERATOR_DATABASE_URL` | **não definir** | **não definir** |
| `MIGRATION_DATABASE_URL` | **não definir** | **não definir** |
| `BACKUP_ENCRYPTION_KEY`, `BACKUP_DATABASE_URL` | **não definir** | **não definir** (só onde roda o `backup:ledger` e na máquina de quem opera) |
| `KMS_*`, `STORAGE_*`, `MAIL_*`, segredos de autenticação | sim | sim (o worker gera exportações e envia lembretes) |

## Passo a passo
1. **Região:** criar o serviço do worker em `{{REGIAO_WORKER}}` (Brasil; `infra/regions.json`, componente
   `worker`). Rodar `pnpm check:infra` se mudar algo no arquivo.
2. **Sem entrada pública:** `{{COMO_SEM_INGRESSO}}` (serviço privado, sem domínio, sem rota no balanceador). O worker
   só precisa de saída para o banco, o storage, o KMS e o e-mail, todos no Brasil exceto o e-mail (SUBPROCESSORS).
3. **Segredos:** cadastrar no gerenciador de segredos `{{SEGREDOS}}` a senha do `app_worker` só para o serviço do
   worker. Conferir que nenhuma instância web tem `WORKER_DATABASE_URL`.
4. **Uma instância** (duas no máximo, para troca sem parada). Reinício automático em falha.
5. **Logs:** a saída vai para o log da plataforma (`logs` em `infra/regions.json`); só linhas do logger passam
   pela guarda do console. Ligar os alertas do `docs/runbooks/ALERTS.md`.
6. **Conferir depois de subir:**
   - em até 1 hora aparece `observability.volume_checked` no log (job de hora em hora);
   - o log diário `privacy.requests_due_soon` aparece em até 24 horas;
   - `pnpm db:verify-roles` com as URLs de produção passa (inclusive "app_user não executa varreduras");
   - uma instância web sem `WORKER_DATABASE_URL` sobe (com a variável, o `parseEnv` recusa).
7. **Ordem nas atualizações:** migração (`pnpm db:deploy` com `app_migrator`, fora do runtime) → worker → web. Num
   restore, worker antes da web (`BACKUP_RESTORE.md`, parte 3).

## Quando algo dá errado
- **Fila parando** (sem `observability.volume_checked` há mais de 2 horas): ver `ALERTS.md`; reiniciar o worker.
- **Purga parada** (`privacy.closures_stalled`): `DATA_SUBJECT_REQUEST.md`, "Purga parada".
- **Credencial do worker vazou:** trocar a senha do `app_worker` (`ALTER ROLE app_worker PASSWORD ...` como dono),
  atualizar o segredo do worker e reiniciar; seguir `INCIDENT.md`.
