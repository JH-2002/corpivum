# Módulo `privacy`

Central de Privacidade: pedidos do titular, encerramento de conta de menor, retenção (AccessLog e provas) e
eliminação agendada dos dados de saúde após a revogação.

- Spec: §46 (ver docs/PRODUCT_SPEC.md e docs/SPEC_ADDENDUM.md)
- Requisitos: LEG-D06, LEG-D07, LEG-F04, LEG-S06, LEG-R02, LEG-R03 (exportação e exclusão: Fase 6)
- Decisões: ADR-0019 (docs/DECISIONS.md)

## Pontos de entrada
- `index.ts`: constantes e tipos (subprocessadores, pedidos). Seguro para componentes cliente.
- `server.ts`: serviço e eliminador (somente servidor).
- `jobs.ts`: `privacy.health_data_eliminate`, `privacy.purge_access_logs`, `privacy.purge_proofs`,
  `privacy.health_data_sweep`.
- `health-data.ts`: eliminador que recebe a lista de eliminadores (produção: `@/modules/health/erasers`,
  Fase 2, ADR-0021). Lista vazia é erro.

Exponha a API pública do módulo apenas por `index.ts`. Outros módulos não importam arquivos internos.
