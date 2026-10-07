# Módulo `demo`

Dados de demonstração 100% fictícios (LEG-X02, §40, ADR-0021).

- `generator.ts`: 90 dias determinísticos, em memória, com a mesma forma de dados dos serviços. Usado pelo
  demo público (`/demo`) e pelo modo demo da conta. **Nunca é gravado** por esses caminhos.
- `seed.ts`: grava o mesmo conjunto numa pessoa fictícia, só para desenvolvimento (`pnpm db:seed`) e e2e.
