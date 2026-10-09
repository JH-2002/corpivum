# Fase 4 — Alimentação, atividade, metas e timeline

> Rode em sessão limpa (`/clear`). Comece pelo modo plan.

```text
Leia CLAUDE.md, docs/LEGAL_REQUIREMENTS.md, docs/SPEC_ADDENDUM.md e as seções relevantes de docs/PRODUCT_SPEC.md. Proponha um plano e aguarde minha aprovação antes de escrever código.

Implemente alimentação (sem juízo nem restrição, LEG-M07), atividade (inclui progressão por exercício, sem
prescrever treino, LEG-M08), metas com progress bars usando o módulo `src/modules/guardrails` (LEG-M04), lembretes
de hábitos e registro via JobQueue, e a timeline pessoal filtrável, integrando sono → atividade → hábitos →
evolução do corpo.
Critérios: metas de peso bloqueiam alvos inseguros com mensagem de apoio (teste); nenhum texto julga corpo ou
comida (teste de termos proibidos); lembretes não dependem do navegador aberto; campos sensíveis criptografados;
RLS em todas as tabelas novas.
Requisitos: LEG-M04, LEG-M06, LEG-M07, LEG-M08, LEG-S02, LEG-S03.
```
