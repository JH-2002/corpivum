# Módulo `sleep`

Registro e métricas de sono: horários, qualidade, despertares e nota cifrada.

- Spec: §20 (ver docs/PRODUCT_SPEC.md e docs/SPEC_ADDENDUM.md)
- Requisitos: LEG-C02, LEG-S02, LEG-S03
- Decisões: ADR-0021 (docs/DECISIONS.md)

## Pontos de entrada
- `index.ts`: tipos, schemas Zod e métricas puras. Seguro para componentes cliente.
- `service.ts`: leitura e escrita; recebe `HealthDeps` (transação com consentimento + RLS, cifra de campo).
  No Next, use `getHealthServices()` de `@/modules/health/server`.
- `eraser.ts`: eliminação após a revogação, registrada em `@/modules/health/erasers` (`DELETE` sem `WHERE`).

Regras: todo acesso por `withConsent('health_data')`; texto livre sempre cifrado; nada de conteúdo em log.
