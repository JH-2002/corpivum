# Fase 6 — Relatórios, direitos do titular e retenção

> Rode em sessão limpa (`/clear`). Comece pelo modo plan.

```text
Leia CLAUDE.md, docs/LEGAL_REQUIREMENTS.md, docs/SPEC_ADDENDUM.md e as seções relevantes de docs/PRODUCT_SPEC.md. Proponha um plano e aguarde minha aprovação antes de escrever código.

Implemente relatórios semanal/mensal/anual e exportação PDF/CSV/JSON via DataExportJob (assíncrono, link de 24h,
autenticado), o fluxo completo de acesso/correção/portabilidade/exclusão/anonimização com PrivacyRequest e
prazos (confirmação imediata, declaração completa em até 15 dias), jobs de purga (PURGE_DAYS, AccessLog por
ACCESS_LOG_RETENTION_DAYS), checagem que falha se a retenção de backup configurada exceder PURGE_DAYS, Modo
apresentação e Modo privacidade.
Critérios: exclusão corta acesso imediatamente e agenda purga; exportação nunca em storage público; teste e2e
do ciclo exportar → excluir → confirmar eliminação.
Requisitos: LEG-D01–D07, LEG-R01–R03, LEG-S07.
```
