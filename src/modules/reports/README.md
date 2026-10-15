# Módulo `reports`

Relatórios semanal, mensal e anual (§29) e exportação completa (portabilidade, LEG-D03), em PDF, CSV e JSON, com link
autenticado que expira em até 24 h. Decisões: ADR-0032.

- `dataset.ts`, `export.ts`, `csv.ts`, `zip.ts`: exportação completa (colunas em lista fechada, sem valores só internos).
- `period.ts`, `report.ts`: períodos civis e modelo do relatório (o mesmo para a tela e o arquivo).
- `service.ts`, `jobs.ts`, `server.ts`: pedido, geração em segundo plano, download, expiração.
- `internal.ts`: valores só internos (IMC, relação cintura/quadril) que nunca saem (LEG-M06).
- Texto e PDF: `src/components/reports` (`document.ts`, `pdf.ts`, `render.ts`).

Exponha a API pública do módulo apenas por `index.ts` (o serviço e o job ficam em `./service`, `./jobs` e `./server`).
