# Fase 1b — Onboarding, consentimento e Central de Privacidade

> Rode em sessão limpa (`/clear`). Comece pelo modo plan.

```text
Leia CLAUDE.md, docs/LEGAL_REQUIREMENTS.md, docs/SPEC_ADDENDUM.md e as seções relevantes de docs/PRODUCT_SPEC.md. Proponha um plano e aguarde minha aprovação antes de escrever código.

Implemente o onboarding da §52, ConsentRecord com finalidades separadas e PolicyVersion (LEG-C01–C06),
reconsentimento quando a versão mudar, e a Central de Privacidade: consentimentos (conceder/revogar em 1–2
cliques), sessões ativas, subprocessadores, pedidos abertos e o fluxo de encerramento para quem se descobre
menor (LEG-F04). Crie AuditLog e AccessLog em tabelas separadas, com job de expurgo do AccessLog por
ACCESS_LOG_RETENTION_DAYS. Implemente o guard que bloqueia qualquer tratamento de dado de saúde sem
ConsentRecord ativo para a finalidade.
Critérios: nenhum checkbox pré-marcado; recusar IA/marketing/métricas não bloqueia o app; revogar consentimento
interrompe o tratamento correspondente imediatamente (teste); AuditLog sem conteúdo; privacy-reviewer sem
achados críticos.
Requisitos: LEG-C*, LEG-F04, LEG-F05, LEG-S06, LEG-R02, LEG-R04, LEG-D06.
```
