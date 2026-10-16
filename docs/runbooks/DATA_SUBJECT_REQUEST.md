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
Cada pessoa que atende tem o **próprio papel de login** `operador_<nome>` (ADR-0037), membro do grupo
`app_operator` (sem login), e o script conecta com ele (`OPERATOR_DATABASE_URL`). O grupo não lê nenhuma tabela:
só executa as funções `app.operator_*` (`pnpm db:verify-roles` confere). Cada ato grava o papel de quem atendeu no
AuditLog (`operator_role`, só o nome técnico). A credencial fica só com quem atende e nunca no runtime do app (o
`parseEnv` recusa em produção).

Criar o papel de uma pessoa (como dono do banco, em produção pelo runbook de provisionamento; nome só com
minúsculas, números e `_`):
```sql
CREATE ROLE operador_<nome> LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT PASSWORD '<senha>';
GRANT app_operator TO operador_<nome> WITH INHERIT TRUE, SET FALSE;
GRANT CONNECT ON DATABASE healthmind TO operador_<nome>;
```
Quando a pessoa deixa a função: `DROP ROLE operador_<nome>` (o AuditLog guarda só o nome). **Nunca reutilize um
nome**: o AuditLog ficaria ambíguo.

1. `pnpm privacy:requests list`: pedidos em aberto, com protocolo, tipo, situação, abertura e prazo. Sem e-mail nem
   pessoa. Pedidos vencidos aparecem marcados `VENCIDO`.
2. `pnpm privacy:requests contact <protocolo>`: e-mail da conta, para responder. **Cada leitura fica no AuditLog**
   (`privacy_request_contact_read`, com o seu papel). Leia só quando for responder; teto de 30 leituras por hora
   por pessoa. Conta excluída: não há contato.
3. Responder pelo e-mail da conta (identidade já confirmada pelo login no app). Nunca copiar dados de saúde para
   e-mail ou ticket; se a pessoa precisar dos dados, oriente a exportação na Central.
4. `pnpm privacy:requests close <protocolo> completed|rejected`: fecha o pedido (AuditLog `privacy_request_closed`).
   Exclusão e encerramento de menor são fechados pelo sistema e o script não os altera; um pedido desses ainda
   aberto (identidade não confirmada) pode ser recusado.
5. **Pedido recebido fora do app** (e-mail ao encarregado, carta; P7-M2): confira a identidade fora do sistema e
   rode `pnpm privacy:requests register <tipo> <aaaa-mm-dd>` com a data em que o pedido chegou (até 15 dias antes;
   o prazo de 15 dias conta dela). O e-mail da conta é pedido no terminal e não fica no histórico do shell. Sem conta
   ativa com esse e-mail, nada é gravado. Pedido aberto do mesmo tipo: devolve o protocolo existente.
6. **Exclusão ou encerramento de menor pedidos fora do app:** depois do `register` (tipo `deletion` ou
   `minor_closure`) e da identidade conferida, `pnpm privacy:requests delete <protocolo>` corta o acesso na hora
   (sessões, links, consentimentos); a purga de arquivos, dados e conta roda no job de hora em hora. Não há e-mail
   automático: responda pelo canal em que o pedido chegou.

**Purga parada** (`privacy.closures_stalled` no log diário): exclusão ou encerramento com o acesso cortado e a
purga ainda não feita há mais de 1 hora. O job falhou de vez e a varredura pula a conta. Corrija a causa (storage,
banco) e, como `app_migrator`, apague os jobs falhos para a varredura de hora em hora tentar de novo:
`DELETE FROM job_queue WHERE status = 'failed' AND name = 'privacy.account_purge';`

Quem não concluiu o cadastro também sai sozinho: o rodapé do onboarding leva a `/boas-vindas/encerrar-conta`
(exclusão ou encerramento de menor com a senha). Conta verificada que não conclui o onboarding é avisada no 23º
dia e apagada 30 dias após o cadastro (e 7 dias após o aviso), pelo job `privacy.onboarding_expiry`.

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
