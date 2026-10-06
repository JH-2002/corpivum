# Módulo `privacy`

Central de Privacidade: direitos do titular, exportação, exclusão, AuditLog e AccessLog.

- Spec: §46 (ver docs/PRODUCT_SPEC.md e docs/SPEC_ADDENDUM.md)
- Requisitos: LEG-D01–D08, LEG-S06, LEG-R01–R04
- Fase prevista: 1b / 6

Exponha a API pública do módulo apenas por `index.ts`. Outros módulos não importam arquivos internos.
