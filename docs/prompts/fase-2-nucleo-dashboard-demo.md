# Fase 2 — Núcleo de dados, dashboard e demo

> Rode em sessão limpa (`/clear`). Comece pelo modo plan.

```text
Leia CLAUDE.md, docs/LEGAL_REQUIREMENTS.md, docs/SPEC_ADDENDUM.md e as seções relevantes de docs/PRODUCT_SPEC.md. Proponha um plano e aguarde minha aprovação antes de escrever código.

Implemente sono, humor, hábitos, diário (criptografado, sem busca textual no conteúdo), peso/medidas e o
Dashboard "Seu estado atual" com cards interativos, gráficos com tooltip e filtro de período global, selos de
confiabilidade em todo dado, estados loading/empty/error/no-data/partial-data. Crie seed 100% sintético e o
modo demo público sem login, com selo DEMO e sem coleta além dos registros técnicos mínimos. Fórmulas do
Índice de Bem-Estar em módulo próprio, versionado e documentado, com tooltip explicando critérios e botão
"pedir revisão" (LEG-D08).
Critérios: nenhum gráfico vazio; Health Score explicável; a11y sem violações críticas (axe) nas telas novas;
todas as tabelas novas com RLS e teste de isolamento.
Requisitos: LEG-X02, LEG-M03, LEG-D08, LEG-S02, LEG-S03.
```
