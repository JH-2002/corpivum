# Módulo `wellbeing`

Índice de Bem-Estar versionado (`SCORE_V1`) e explicável, e resumo do dashboard por regras.

- Spec: §14, §11.1 (ver docs/PRODUCT_SPEC.md e docs/SPEC_ADDENDUM.md)
- Requisitos: LEG-D08, LEG-M03
- Fórmulas: docs/WELLBEING_SCORE.md · Decisões: ADR-0021

## Pontos de entrada
- `index.ts`: `computeWellbeingScore`, `buildSummary` e tipos (funções puras, seguras no cliente).
- `server.ts`: `requestScoreReview` (pedido de revisão, art. 20), somente servidor.

Mudar peso, limiar ou fórmula = versão nova (`SCORE_Vn`), com testes e documentação.
