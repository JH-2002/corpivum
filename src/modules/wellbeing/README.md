# Módulo `wellbeing`

Índice de Bem-Estar versionado (`SCORE_V1`) e explicável. O resumo do dashboard por regras fica em
`src/modules/insights` (ADR-0025).

- Spec: §14, §11.1 (ver docs/PRODUCT_SPEC.md e docs/SPEC_ADDENDUM.md)
- Requisitos: LEG-D08, LEG-M03
- Fórmulas: docs/WELLBEING_SCORE.md · Decisões: ADR-0021

## Pontos de entrada
- `index.ts`: `computeWellbeingScore` e tipos (funções puras, seguras no cliente).
- `server.ts`: `requestScoreReview` (pedido de revisão, art. 20), somente servidor.

Mudar peso, limiar ou fórmula = versão nova (`SCORE_Vn`), com testes e documentação.
