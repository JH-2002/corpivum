# Runbook — Backup e restauração

> **RASCUNHO.** Requisitos: LEG-S07, LEG-D04. Completar quando a hospedagem for escolhida (OPEN_ISSUES OI-11).

## Regras
- Backups **cifrados**, na mesma região (Brasil, LEG-S10).
- **Retenção ≤ `PURGE_DAYS`** (padrão 30 dias): dados excluídos não podem sobreviver em backup além do prazo de
  purga. `BACKUP_RETENTION_DAYS` documenta o valor; `parseEnv` e `assertRetentionPolicy` falham se ele exceder
  `PURGE_DAYS`, e `pnpm check:retention` confere a política declarada em `infra/retention.json` (ADR-0035).
- Restauração testada periodicamente em ambiente isolado, nunca com dados reais em desenvolvimento.

## Configuração
| Item | Valor |
|---|---|
| Provedor | `{{BANCO}}` |
| Frequência | `{{FREQUENCIA}}` |
| Retenção | `{{BACKUP_RETENTION_DAYS}}` dias (≤ `PURGE_DAYS`) |
| Criptografia | `{{KMS}}` |
| Política declarada | `infra/retention.json` (conferida na CI) |
| Checagem automática da retenção real do provedor | Fase 7 (ver ADR-0008, ADR-0035) |

## Teste de restauração (`{{PERIODICIDADE}}`)
1. Restaurar o backup mais recente em ambiente isolado.
2. Rodar as migrações pendentes como `app_migrator` e `pnpm db:verify-roles`.
3. Verificar contagem de linhas por tabela e integridade (sem inspecionar conteúdo sensível).
4. Verificar que contas excluídas há mais de `PURGE_DAYS` não reaparecem.
5. Registrar data, duração, resultado e responsável. Destruir o ambiente.

## Restauração após exclusão de conta ou eliminação
Prazos e pior caso em `docs/privacy/RETENTION.md` (ADR-0035). Se uma restauração reintroduzir contas excluídas ou
dados de saúde já eliminados, reaplicar antes de liberar o acesso:
1. Contas excluídas: `privacy_requests` com `kind = 'deletion'` e `status = 'completed'` fechados depois da data do
   backup (o `user_id` fica, sem FK). Para cada conta ainda presente, rodar a purga (`privacy.account_purge`).
2. Dados de saúde eliminados: AuditLog `health_data_eliminated` depois da data do backup. Para cada conta, rodar o
   eliminador (`privacy.health_data_eliminate`).
3. Exportações: todas as linhas de `data_export_jobs` restauradas viram `expired` (o arquivo no storage já não existe).
4. Registrar a reaplicação no AuditLog e no registro do teste de restauração, sem conteúdo de saúde.
