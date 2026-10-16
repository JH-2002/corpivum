# Runbook — Erros e alertas de volume

> Fase 7c (ADR-0038; LEG-R04, LEG-S06). O canal que recebe os alertas fora da aplicação e o fornecedor da
> ferramenta de erros ficam no `docs/legal/CHECKLIST_GO_LIVE.md` (OI-03, OI-11). Até lá, tudo sai no log
> estruturado da instância (JSON por linha).

## O que aparece no log

| Evento | Nível | Campos | Origem |
|---|---|---|---|
| `error.request` | error | `reportId`, `errorName`, `errorCode`, `digest`, `frame`, `route`, `routeType`, `method` | `onRequestError` (render, route handler, server action, proxy) |
| `error.job` | error | `reportId`, `errorName`, `errorCode`, `frame`, `adapter`, `jobName`, `jobId`, `attempt` | handler de job que lançou (7c-R3, ADR-0039); vem junto do `job.failed` |
| `error.report_failed` | error | nenhum | falha ao montar ou entregar o relatório |
| `observability.volume_checked` | info | `count` (tuplas lidas), `threshold` | job `observability.volume_check`, de hora em hora |
| `alert.read_volume_anomaly` | warn | `count`, `threshold` | leitura das tabelas de saúde acima do teto (P7-M1) |
| `alert.operator_volume_anomaly` | warn | `count`, `threshold` | um papel de operador com mais de 20 ações por hora (7b-R3) |

Nenhum deles leva mensagem de erro, corpo, query, cabeçalhos, cookies, pessoa, e-mail ou papel do operador. Não
copie dado pessoal para o ticket ou o chat (`INCIDENT.md`, seção 1).

## `error.job`
1. `jobName` e `attempt` dizem qual job e em que tentativa; o `job.failed` da mesma hora tem o mesmo `jobId`. O
   payload (ids de pessoa e de recurso) nunca vai ao relatório.
2. Na última tentativa o job fica `failed` em `job_queue` (`last_error_code` é o nome reduzido do erro). Corrija a
   causa e se for purga, reenfileire como no passo do `privacy.closures_stalled` (`DATA_SUBJECT_REQUEST.md`).
3. Reproduza em desenvolvimento com dados sintéticos, como no `error.request`.

## `error.request`
1. O `digest` é o mesmo que a página de erro mostra a quem foi afetado: use-o para ligar o relato ao log.
2. `route` é o arquivo da rota (ex.: `/(app)/corpo/page`), sem valores. `frame` é o topo da pilha, sem pasta.
3. Reproduza em desenvolvimento com dados sintéticos: lá o terminal mostra a mensagem original. Em produção ela
   não aparece de propósito (guarda do console, ADR-0038).

## `alert.read_volume_anomaly` (P7-M1)
Leitura das tabelas de saúde, de `users` e de `consent_records` em cerca de 1 hora acima de
`max(100.000, 5 × mediana por hora dos 7 dias anteriores)`. É o sinal de código rodando como o runtime e lendo
muitas contas (dependência maliciosa, invasão).

1. Abra o registro de incidente (`INCIDENT.md`, nível Médio até descartar acesso indevido).
2. No banco, como `app_migrator`, veja quais tabelas cresceram (só contadores, sem dado pessoal):
   ```sql
   SELECT relname, seq_tup_read, seq_scan, idx_scan
     FROM pg_stat_user_tables WHERE schemaname = 'public' ORDER BY seq_tup_read DESC;
   SELECT relname, sum(idx_tup_read) FROM pg_stat_user_indexes WHERE schemaname = 'public'
    GROUP BY 1 ORDER BY 2 DESC;
   SELECT sampled_at, tuples_total FROM app.read_volume_samples ORDER BY sampled_at DESC LIMIT 24;
   ```
3. Descarte causas legítimas no mesmo período: deploy com consulta nova sem índice (`seq_scan` alto numa tabela),
   pico de exportações (`data_export_jobs`), job reprocessado, `pg_dump` ou backup lógico rodando no banco.
4. Sem causa legítima: trate como incidente Crítico (`INCIDENT.md`): revogar sessões, girar segredos e a
   credencial do `app_user`, preservar os logs da hospedagem e do banco.
5. Falso positivo recorrente: recalibre `VOLUME_LIMITS` (`src/modules/observability/volume.ts`) em PR, com o
   número observado.

## `alert.operator_volume_anomaly` (7b-R3)
Um mesmo papel `operador_<nome>` fez mais de 20 ações no AuditLog no período (registro, consulta sem pedido novo,
leitura do contato, exclusão, fechamento).

1. Como `app_migrator`, veja quem e o quê (o AuditLog guarda só o papel, a ação e IDs). Consultas desfeitas por
   ROLLBACK não ficam no AuditLog: procure `privacy_request_lookup operator_role=` no log do servidor do banco.
   ```sql
   SELECT operator_role, action, count(*) FROM audit_logs
    WHERE operator_role IS NOT NULL AND created_at > now() - interval '2 hours'
    GROUP BY 1, 2 ORDER BY 3 DESC;
   ```
2. Confirme com a pessoa e com os pedidos recebidos no canal do encarregado. Sem explicação: revogue o papel
   (`REVOKE app_operator FROM operador_<nome>`) e abra incidente.

## Sem `observability.volume_checked` há mais de 2 horas
O worker parou ou a função falhou (`job.failed` com `jobName=observability.volume_check`). Veja o worker
(`JOB_WORKER`, OI-14) e rode `pnpm db:verify-roles`.
