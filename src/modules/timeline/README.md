# Módulo `timeline`

Linha do tempo pessoal e marcos (ADR-0029).

- Spec: §31 · Requisitos: LEG-M06, LEG-M07
- `build.ts`: `buildTimeline` (por dia, sono → atividade → hábitos → corpo → alimentação; filtro por domínio) e
  `parseTimelineDomain`.
- Regras: marcos só de hábito novo e meta semanal atingida (`allowsMilestone`): nunca peso nem calorias.
