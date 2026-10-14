# Módulo `goals`

Metas com limites de segurança e tom neutro (ADR-0029).

- Spec: §30 · Requisitos: LEG-M04, LEG-M06, LEG-M07, LEG-F05
- `index.ts`: tipos, `goalInputSchema` e progresso puro (`goalProgress`, `weeklyResults`).
- `service.ts`: toda gravação passa por `checkGoal` (`@/modules/guardrails`) com peso, altura e preferência lidos
  do banco; bloqueada = nada gravado.
- Regras: peso sem barra, sem sequência e sem marco; dias só com pesagem não contam como registro; prazo encerrado
  em tom neutro.
