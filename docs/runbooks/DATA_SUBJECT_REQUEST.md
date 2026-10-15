# Runbook — Pedidos do titular (LGPD art. 18)

> **RASCUNHO.** `LEGAL-REVIEW`. Requisitos: LEG-D01–D08. Implementação na Central de Privacidade (Fases 1b, 6a e
> 6b; ADR-0019, ADR-0032, ADR-0033, ADR-0034).

## Prazos
- Confirmação de existência / acesso em formato simplificado: **imediato** (pela Central de Privacidade).
- Declaração completa: **até 15 dias** a partir do pedido (art. 19, II).
- Todo pedido gera um `PrivacyRequest` com status e prazo (LEG-D07), aberto por `app.privacy_request_open`
  (idempotente com pedido aberto do mesmo tipo; no máximo 10 pedidos novos por pessoa em 24 h).
- A pessoa recebe na tela o comprovante (protocolo, tipo, data e prazo) e um recibo por e-mail com os mesmos
  dados (modelo `privacy-request-received`, sem conteúdo de saúde).
- Job diário `privacy.request_deadlines`: o log traz só a contagem de pedidos que vencem em até 3 dias
  (`privacy.requests_due_soon`) e dos vencidos (`privacy.requests_overdue`, nível `warn`). Vencido = atender hoje.

## Tipos de pedido
| Pedido | Como atender | Fechamento | Requisito |
|---|---|---|---|
| Confirmação e acesso | Seção "Seus dados": categorias, quantidade de registros, onde corrigir, o que fica da conta; cópia completa | **Automático**, na hora | LEG-D01 |
| Correção | Edição na própria tela de cada registro, sem histórico (OI-20). Dado da conta que não se edita no app: o encarregado fala com a pessoa pelo e-mail da conta | **Manual** | LEG-D02 |
| Portabilidade | Exportação completa JSON/CSV assíncrona, link autenticado que expira em até 24 h (ADR-0032; carência após revogar, ADR-0033) | **Automático**, quando a cópia fica pronta. Sem autorização nem carência, no demo ou no limite diário de arquivos: fica aberto (manual) | LEG-D03 |
| Eliminação | "Excluir conta": reautenticação, frase de confirmação, acesso cortado na hora e purga em minutos | **Sistema** (job `privacy.account_purge`) | LEG-D04 |
| Anonimização | Não há uso estatístico dos dados (OI-31): o encarregado explica e oferece a exclusão | **Manual** | LEG-D05 |
| Informação sobre compartilhamento | Subprocessadores com finalidade e região, na Central e na página pública | **Automático**, na hora | LEG-D06 |
| Revogação de consentimento | Central de Privacidade, 1–2 cliques, efeito imediato | Não gera pedido | LEG-C04 |
| Revisão de decisão automatizada | Botão "pedir revisão" no Índice de Bem-Estar | **Manual** (OI-18) | LEG-D08 |

## Atendimento manual (`pnpm privacy:requests`)
O script conecta como `app_operator` (`OPERATOR_DATABASE_URL`). Esse papel não lê nenhuma tabela: só executa
`app.operator_requests_due`, `app.operator_request_contact` e `app.operator_request_close` (`pnpm db:verify-roles`
confere). A credencial fica só com o encarregado e nunca no runtime do app (o `parseEnv` recusa em produção).

1. `pnpm privacy:requests list`: pedidos em aberto, com protocolo, tipo, situação, abertura e prazo. Sem e-mail nem
   pessoa. Pedidos vencidos aparecem marcados `VENCIDO`.
2. `pnpm privacy:requests contact <protocolo>`: e-mail da conta, para responder. **Cada leitura fica no AuditLog**
   (`privacy_request_contact_read`). Leia só quando for responder. Conta excluída: não há contato.
3. Responder pelo e-mail da conta (identidade já confirmada pelo login no app). Nunca copiar dados de saúde para
   e-mail ou ticket; se a pessoa precisar dos dados, oriente a exportação na Central.
4. `pnpm privacy:requests close <protocolo> completed|rejected`: fecha o pedido (AuditLog `privacy_request_closed`).
   Exclusão e encerramento de menor são fechados pelo sistema e o script não os altera.

Respostas-modelo (RASCUNHO, `LEGAL-REVIEW`):
- **Correção:** confirmar qual dado da conta precisa de correção e como corrigir; registros de bem-estar a pessoa
  corrige na própria tela.
- **Anonimização:** os registros de bem-estar não são usados para estatística nem para outra finalidade além do
  app; não há o que anonimizar para esse fim. Métricas de uso (`product_metrics`) e comunicações (`marketing`) só
  com autorização, revogável na Central. Se a pessoa quer que os dados deixem de existir, a exclusão de conta corta o
  acesso na hora e apaga tudo em poucos minutos (OI-31).
- **Portabilidade sem cópia possível:** explicar o motivo (sem autorização de dados de bem-estar, demo, limite
  diário) e como gerar a cópia; a cópia pronta conclui o pedido sozinha.

## Exclusão de conta (LEG-D04, purga imediata, ADR-0034)
- O que a pessoa vê antes: o que é apagado e o que fica (provas mínimas por `PROOF_RETENTION_DAYS`, registros de
  acesso por `ACCESS_LOG_RETENTION_DAYS`, backups substituídos em até `BACKUP_RETENTION_DAYS` ≤ `PURGE_DAYS`) e a
  oferta de baixar a cópia completa antes. Sem cópia pronta, precisa marcar "Não quero baixar meus dados".
- Confirmação: senha atual e, com MFA, o TOTP ou um código de recuperação; prova de uso único de 2 min
  (`account_deletion`); frase "excluir minha conta" conferida no servidor.
- Na hora: `deleted_at`, sessões e tokens revogados, consentimentos revogados, links de exportação vencidos,
  pedido `deletion` em andamento. Em minutos (`privacy.account_purge`): aviso por e-mail (`account-deleted`, sem dado
  de saúde nem link de login; falha no envio não segura a purga), arquivos no storage, tabelas e `DELETE` da conta.
  O aviso sai uma vez só, logo depois da confirmação. O e-mail fica livre para novo cadastro. Os demais pedidos
  abertos da pessoa saem como recusados (perderam o objeto; OI-33). Pedidos de exportação na fila ou em geração
  param na exclusão e a carência acaba.
- Rede de segurança: `privacy.account_purge_sweep` (diário) reenfileira contas excluídas que ainda existem.
- Não há prazo de arrependimento (OI-33, `LEGAL-REVIEW`): não dá para restaurar uma conta excluída.

## Pedidos fora do app (e-mail ao encarregado)
1. Pedir que a pessoa use a Central (pedido com protocolo e prazo). Se não puder, registrar o pedido sem copiar dados
   de saúde para e-mail ou ticket.
2. Confirmar a identidade do titular pelo canal autenticado da conta antes de qualquer resposta com dados.
3. Responder dentro do prazo; fechar o pedido com o script.
4. Canal: `{{CONTATO_ENCARREGADO}}`.
