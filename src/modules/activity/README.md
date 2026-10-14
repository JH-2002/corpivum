# Módulo `activity`

Atividades, séries de força e progressão por exercício (ADR-0029).

- Spec: §26 · Requisitos: LEG-M08, LEG-M07, LEG-S02, LEG-S03
- `index.ts`: tipos, schemas (`setsFromForm`) e métricas puras (minutos, sessões, `exerciseProgression`).
- `service.ts`: consentimento + RLS; nota e nome do exercício cifrados; séries substituídas na edição.
- Regras: progressão só em relação ao próprio histórico; sem calorias gastas; nada sugere carga, série ou treino.
