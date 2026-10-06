# Runbook — Backup e restauração

> **RASCUNHO.** Requisitos: LEG-S07, LEG-D04. Completar quando a hospedagem for escolhida (OPEN_ISSUES OI-11).

## Regras
- Backups **cifrados**, na mesma região (Brasil, LEG-S10).
- **Retenção ≤ `PURGE_DAYS`** (padrão 30 dias): dados excluídos não podem sobreviver em backup além do prazo de
  purga. `BACKUP_RETENTION_DAYS` documenta o valor e `parseEnv` falha se ele exceder `PURGE_DAYS`.
- Restauração testada periodicamente em ambiente isolado, nunca com dados reais em desenvolvimento.

## Configuração
| Item | Valor |
|---|---|
| Provedor | `{{BANCO}}` |
| Frequência | `{{FREQUENCIA}}` |
| Retenção | `{{BACKUP_RETENTION_DAYS}}` dias (≤ `PURGE_DAYS`) |
| Criptografia | `{{KMS}}` |
| Checagem automática da retenção real do provedor | Fase 7 (ver ADR-0008) |

## Teste de restauração (`{{PERIODICIDADE}}`)
1. Restaurar o backup mais recente em ambiente isolado.
2. Rodar as migrações pendentes como `app_migrator` e `pnpm db:verify-roles`.
3. Verificar contagem de linhas por tabela e integridade (sem inspecionar conteúdo sensível).
4. Verificar que contas excluídas há mais de `PURGE_DAYS` não reaparecem.
5. Registrar data, duração, resultado e responsável. Destruir o ambiente.

## Restauração após exclusão de conta
Se uma restauração reintroduzir dados de contas excluídas dentro do prazo, reaplicar a purga
(lista de exclusões pendentes) antes de liberar o acesso.
