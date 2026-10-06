# Módulo `notifications`

Lembretes e notificações via JobQueue, sem insistência.

- Spec: §33 (ver docs/PRODUCT_SPEC.md e docs/SPEC_ADDENDUM.md)
- Requisitos: LEG-F05
- Fase prevista: 4

Exponha a API pública do módulo apenas por `index.ts`. Outros módulos não importam arquivos internos.
