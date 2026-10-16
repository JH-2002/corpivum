# Módulo `observability`

Alertas de volume anômalo (Fase 7c, ADR-0038). Os relatórios de erro ficam no adaptador `ErrorReporter`
(`src/adapters/error-reporter`) e na lista de permissão de `src/lib/observability`.

- Requisitos: LEG-R04, LEG-S03, LEG-S06; achados P7-M1 e 7b-R3 (docs/legal/OPEN_ISSUES.md)
- Decisões: ADR-0036 (D2), ADR-0038 (docs/DECISIONS.md)
- Runbook: docs/runbooks/ALERTS.md

## Pontos de entrada
- `index.ts`: monitor, avaliação pura e jobs (somente servidor).
- `volume.ts`: `evaluateVolume` (tetos) e `createVolumeMonitor` (amostra no `app_worker`, alerta no reporter).
- `jobs.ts`: `observability.volume_check`, de hora em hora.

O alerta leva só contagem e teto: nenhuma pessoa, papel ou recurso. Exponha a API pública só por `index.ts`.
