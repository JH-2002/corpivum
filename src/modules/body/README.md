# Módulo `body`

Peso e medidas informados; IMC calculado na leitura (ESTIMADO), sem classificação.

- Spec: §23 (ver docs/PRODUCT_SPEC.md e docs/SPEC_ADDENDUM.md)
- Requisitos: LEG-M04, LEG-S03
- Decisões: ADR-0021 (docs/DECISIONS.md)

## Pontos de entrada
- `index.ts`: tipos, schemas Zod e métricas puras. Seguro para componentes cliente.
- `service.ts`: leitura e escrita; recebe `HealthDeps` (transação com consentimento + RLS, cifra de campo).
  No Next, use `getHealthServices()` de `@/modules/health/server`.
- `eraser.ts`: eliminação após a revogação, registrada em `@/modules/health/erasers` (`DELETE` sem `WHERE`).

Regras: todo acesso por `withConsent('health_data')`; texto livre sempre cifrado; nada de conteúdo em log.
