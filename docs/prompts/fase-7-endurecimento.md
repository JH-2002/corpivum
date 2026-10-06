# Fase 7 — Endurecimento e pré-lançamento

> Rode em sessão limpa (`/clear`). Comece pelo modo plan.

```text
Leia CLAUDE.md, docs/LEGAL_REQUIREMENTS.md, docs/SPEC_ADDENDUM.md e as seções relevantes de docs/PRODUCT_SPEC.md. Proponha um plano e aguarde minha aprovação antes de escrever código.

Execute: threat model (docs/security/THREAT_MODEL.md), revisão com o subagente privacy-reviewer em todo o
repositório, testes e2e dos fluxos críticos, auditoria axe e teste manual de teclado/leitor de tela, teste de
performance em dispositivo modesto, observabilidade com remoção de PII, headers de segurança, scripts de
restauração de backup, runbook de incidentes, IaC básico com todas as regiões no Brasil (inclusive execução
das funções), revisão de SUBPROCESSORS.md, e finalize os rascunhos de ROPA, RIPD e documentos públicos com os
placeholders listados em docs/legal/OPEN_ISSUES.md.
Critérios: nenhuma violação crítica aberta; OPEN_ISSUES.md consolidado para entrega ao jurídico.
Requisitos: LEG-S07–S10, LEG-G01–G05, LEG-X01.
```
