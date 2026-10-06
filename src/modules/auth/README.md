# Módulo `auth`

Conta, autenticação, MFA, sessões em banco e age gate 18+.

- Spec: §52 (ver docs/PRODUCT_SPEC.md e docs/SPEC_ADDENDUM.md)
- Requisitos: LEG-S04, LEG-F01, LEG-F03
- Fase prevista: 1a

Exponha a API pública do módulo apenas por `index.ts`. Outros módulos não importam arquivos internos.
