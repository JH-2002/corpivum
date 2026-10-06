# Runbook — Pedidos do titular (LGPD art. 18)

> **RASCUNHO.** `LEGAL-REVIEW`. Requisitos: LEG-D01–D08. Implementação na Central de Privacidade (Fases 1b e 6).

## Prazos
- Confirmação de existência / acesso em formato simplificado: **imediato** (pela Central de Privacidade).
- Declaração completa: **até 15 dias** a partir do pedido (art. 19, II).
- Todo pedido gera um `PrivacyRequest` com status e prazo (LEG-D07).

## Tipos de pedido
| Pedido | Como atender | Requisito |
|---|---|---|
| Confirmação e acesso | Tela com todos os dados por categoria | LEG-D01 |
| Correção | Edição pelo próprio usuário, com histórico | LEG-D02 |
| Portabilidade | Exportação JSON/CSV assíncrona, link autenticado que expira em 24h | LEG-D03 |
| Eliminação | Exclusão com confirmação reforçada; acesso cortado na hora; purga em `PURGE_DAYS` | LEG-D04 |
| Anonimização | Opção de anonimizar para uso estatístico | LEG-D05 |
| Informação sobre compartilhamento | Página de subprocessadores | LEG-D06 |
| Revogação de consentimento | Central de Privacidade, 1–2 cliques, efeito imediato | LEG-C04 |
| Revisão de decisão automatizada | Botão "pedir revisão" no Health Score e recomendações | LEG-D08 |

## Pedidos fora do app (e-mail ao encarregado)
1. Registrar o pedido (`PrivacyRequest`) sem copiar dados de saúde para e-mail ou ticket.
2. Confirmar a identidade do titular pelo canal autenticado da conta antes de qualquer resposta com dados.
3. Responder dentro do prazo; registrar a resposta e a data.
4. Canal: `{{CONTATO_ENCARREGADO}}`.
