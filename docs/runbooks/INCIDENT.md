# Runbook — Incidente de segurança com dados pessoais

> **RASCUNHO.** `LEGAL-REVIEW`: confirmar prazos e conteúdo da comunicação no regulamento vigente da ANPD
> (OPEN_ISSUES OI-05). Requisitos: LEG-S07, LEG-S08. Atualizado na 7e (ADR-0040) e na 7f (ADR-0041).

## 0. Contatos
| Papel | Nome | Contato |
|---|---|---|
| Responsável pelo incidente | `{{RESPONSAVEL_INCIDENTE}}` | `{{CONTATO_INCIDENTE}}` |
| Encarregado (DPO) | `{{ENCARREGADO}}` | `{{CONTATO_ENCARREGADO}}` |
| Jurídico | `{{JURIDICO}}` | `{{CONTATO_JURIDICO}}` |
| Hospedagem / banco | `{{HOSPEDAGEM}}` | `{{SUPORTE_HOSPEDAGEM}}` |

## 1. Detecção e registro (imediato)
1. Abrir registro interno: data/hora da detecção (UTC), quem detectou, sistemas afetados, como foi detectado.
2. **Não** copiar dados pessoais para o registro, chat ou ticket: só identificadores técnicos (UUID, protocolo)
   e metadados. Nunca colar e-mail, medidas, notas, alimentação ou credenciais.
3. Preservar evidências antes de alterar sistemas: logs da plataforma, log do servidor do banco (inclui o
   `RAISE LOG` das consultas do encarregado), AuditLog (`audit_logs`, só enums e UUIDs) e configurações.
   Se for preciso congelar o banco, use um backup ou PITR do provedor (não um dump numa máquina pessoal).

4. **Investigar AuditLog e AccessLog** (P7-B9): o runtime não lê essas tabelas (LEG-S06, LEG-R02); só o
   `app_migrator`, de uma máquina de operação, em sessão `READ ONLY`, com a consulta registrada no relatório do
   incidente. Só metadados: nunca juntar com `users.email` no mesmo resultado nem exportar para fora do provedor.
   ```sql
   BEGIN READ ONLY;
   -- O que aconteceu numa janela (ações, recursos e papéis de operador, sem conteúdo):
   SELECT action, resource_type, operator_role, count(*) FROM audit_logs
    WHERE created_at BETWEEN '<início UTC>' AND '<fim UTC>' GROUP BY 1, 2, 3 ORDER BY 4 DESC;
   -- Linha do tempo de uma conta (UUID vindo do alerta ou do protocolo, nunca do e-mail):
   SELECT created_at, action, resource_type, resource_id, operator_role FROM audit_logs
    WHERE subject_user_id = '<uuid>' ORDER BY created_at;
   -- IPs de acesso de uma conta (Marco Civil; fornecer a terceiros só com ordem judicial, OI-17):
   SELECT occurred_at, ip FROM access_logs WHERE user_id = '<uuid>'
    AND occurred_at BETWEEN '<início UTC>' AND '<fim UTC>' ORDER BY occurred_at;
   ROLLBACK;
   ```
   Consultas do encarregado que não abriram pedido ficam no log do servidor do banco (`RAISE LOG`, 7b-R3), não
   no AuditLog.

Sinais que abrem incidente (`ALERTS.md`): `alert.read_volume_anomaly`, `alert.operator_volume_anomaly`, picos de
`error.request`, `privacy.closures_stalled` persistente, `reports.orphans_unknown` (arquivo estranho no prefixo
de exportações), aviso do provedor, relato de titular ou do pentest.

## 2. Classificação
| Nível | Critério | Exemplos |
|---|---|---|
| Crítico | Dados de saúde (corpo, sono, hábitos, alimentação, atividade, metas), credenciais ou chaves expostos ou acessados por terceiro | Falha de RLS, vazamento de backup, `BACKUP_ENCRYPTION_KEY` ou chave do KMS expostas |
| Alto | Dados pessoais não sensíveis expostos; acesso indevido contido | E-mails expostos, credencial de operador usada por terceiro |
| Médio | Vulnerabilidade explorável sem evidência de acesso | Dependência vulnerável em produção |
| Baixo | Sem dado pessoal envolvido | Indisponibilidade |

## 3. Contenção
Escolha o que se aplica; registre cada ação com horário.
- **Sessões:** derrubar todas, como `app_migrator`: `UPDATE sessions SET revoked_at = now() WHERE revoked_at IS NULL`
  (sessões em banco, LEG-S04). Todos entram de novo.
- **Credenciais do banco:** trocar a senha do papel exposto (`ALTER ROLE ... PASSWORD`) e atualizar o segredo de
  quem o usa: `app_user` (web e worker), `app_worker` (só o worker, `WORKER_DEPLOY.md`), `operador_<nome>`
  (`OPERATOR_CREDENTIALS.md`; revogar com `REVOKE CONNECT` se houver dúvida), `app_migrator` (só máquinas de
  operação).
- **Segredos do app e chaves:** `KEY_ROTATION.md` (KMS, `SESSION_SECRET`, `RATE_LIMIT_SECRET`,
  `RECOVERY_CODE_PEPPER`, `BACKUP_ENCRYPTION_KEY`).
- **Parar uma função:** desligar o worker para parar envios de e-mail e geração de exportações; tirar a web do ar
  com página de manutenção se o vazamento estiver em curso.
- **Storage:** se arquivos de exportação vazaram, apagar o prefixo `exports/` inteiro (são temporários; o
  `reports.expire` marca os pedidos) e conferir a regra de ciclo de vida.
- **Correção:** aplicar, validar com os testes de isolamento (`pnpm test:db`, `pnpm db:verify-roles`) e subir.

## 4. Recuperação de dados
Se houve perda ou corrupção de dados (exclusão em massa, alteração indevida, banco perdido):
1. Decidir o ponto de restauração com o responsável: PITR até **um pouco antes** do incidente; sem PITR, o
   backup mais recente anterior a ele.
2. Seguir `BACKUP_RESTORE.md`, parte 3, **sem pular a reaplicação**: com a origem ainda legível, `--source`; com a
   origem perdida, o livro mais recente (`--ledger`). Nada é liberado antes da reaplicação.
3. Registrar o intervalo de mudanças que não pôde ser reaplicado (`BACKUP_RESTORE.md`, parte 5) e incluir na
   avaliação de risco (item 5): exclusões e revogações desse intervalo precisam ser refeitas.
4. Comunicar a todos que precisam entrar de novo; quem trocou a senha depois do ponto restaurado precisa
   redefinir.

## 5. Avaliação de risco aos titulares
Avaliar se o incidente pode acarretar risco ou dano relevante: natureza sensível dos dados, volume, titulares,
possibilidade de reidentificação, medidas de proteção (criptografia de campo, RLS, backups cifrados) e se dado
excluído voltou a existir por uma restauração.

## 6. Comunicação
- **ANPD:** quando houver risco ou dano relevante, no prazo do regulamento vigente: `{{PRAZO_ANPD}}`.
  Conteúdo mínimo: natureza dos dados, titulares envolvidos, medidas técnicas, riscos, motivos de eventual
  demora, medidas adotadas.
- **Titulares:** linguagem clara, o que aconteceu, quais dados, o que fazer, canal de contato do encarregado.
- Textos-modelo: `{{MODELO_COMUNICACAO}}`.

## 7. Encerramento
- Relatório interno (linha do tempo, causa raiz, medidas, lições) e atualização do RIPD e do THREAT_MODEL.
- Ensaio de restauração registrado, se houve restauração (`BACKUP_RESTORE.md`, parte 6).
- Guardar o registro do incidente pelo prazo definido pelo jurídico.
