# Módulo `health`

Núcleo compartilhado dos módulos de saúde (ADR-0021).

- `core.ts`: `HealthRunner` (transação com consentimento `health_data`) e `FieldCipher` (cifra de campo,
  ADR-0016). `zod.ts`: Zod de formulário, sem dependência de servidor.
- `source.ts`: `HealthDataSource`, a fonte única das telas (dados próprios ou demonstração).
- `dashboard.ts`: modelo do Dashboard "Seu estado atual" (§11, §12), agregado no servidor.
- `server.ts`: serviços e fontes para o Next (somente servidor). `session()` faz as leituras de uma tela
  numa só transação.
- `erasers.ts`: eliminadores de TODAS as tabelas de saúde. Tabela nova = eliminador aqui + classificação em
  `tests/db/health.test.ts`.
- `form-result.ts`: apoio às server actions (erros traduzidos, modo demo somente leitura).
- `mask.ts`: modo privacidade no servidor (ADR-0035): tira peso, medidas, altura e calorias dos dados de cada tela
  antes de chegar aos componentes. Valor novo do corpo numa tela = passar pelo mascarador correspondente.
