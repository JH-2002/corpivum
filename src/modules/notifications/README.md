# Módulo `notifications`

Lembretes por e-mail processados no servidor pela JobQueue, sem insistência (ADR-0029).

- Spec: §33 · Requisitos: LEG-F05, LEG-C04, LEG-R04
- `schedule.ts`: próxima ocorrência no fuso, horário silencioso, próximos lembretes (puro).
- `service.ts`: lembretes (tabela de saúde) e `claimSend` (um envio por lembrete por dia).
- `jobs.ts`: `reminder.dispatch` (payload só com IDs), registrado em `src/server-jobs.ts`.
- Regras: e-mail só com um link (sem nome do hábito); push fora do escopo (OI-27).
