# Retenção e eliminação

> **RASCUNHO — `LEGAL-REVIEW`.** Requisitos: LEG-R01, LEG-R02, LEG-R03, LEG-R04, LEG-D03, LEG-D04, LEG-S07.
> Decisões: ADR-0008, ADR-0017, ADR-0019, ADR-0032, ADR-0034, ADR-0035. Prazos em aberto: OI-04 (provas), OI-06
> (registros de acesso), OI-16 (carência após revogar), OI-33 (exclusão imediata).

Prazos de cada categoria, o job que os cumpre e onde a regra é conferida. Valores do `.env.example`; produção
usa os mesmos, salvo decisão registrada em ADR.

## Prazos e jobs

| Categoria | Prazo | Como sai | Job (frequência) |
|---|---|---|---|
| Dados de saúde (corpo, sono, hábitos, alimentação, atividade, metas, lembretes) | Enquanto a conta existir (LEG-R01) | Exclusão da conta ou eliminação após revogar | — |
| Dados de saúde depois de revogar o consentimento | `HEALTH_DATA_GRACE_DAYS` = 30 dias (OI-16) | Eliminadores de `HEALTH_DATA_ERASERS`; reconsentir antes cancela | `privacy.health_data_eliminate` (agendado na revogação) + `privacy.health_data_sweep` (diário) |
| Conta excluída pela pessoa | Minutos (purga imediata, OI-33) | Arquivos no storage, eliminadores e `DELETE` da conta (cascata) | `privacy.account_purge` (logo após a exclusão) + `privacy.account_purge_sweep` (diário) |
| Conta de quem se descobre menor (LEG-F04) | Na hora | Mesma transação do encerramento | — |
| Arquivos de exportação e relatórios | Link de até `EXPORT_LINK_HOURS` = 24 h (teto 24, LEG-D03) | Linha vira `expired` e o arquivo cifrado é apagado | `reports.expire` (de hora em hora) |
| Exportações ao revogar o consentimento de saúde | Na hora (fora a carência da portabilidade, OI-32) | Links vencem na transação da revogação | `reports.expire` apaga os arquivos |
| Registros de acesso (IP + data/hora) | `ACCESS_LOG_RETENTION_DAYS` = 180 dias, teto 180 (LEG-R02, OI-06) | `app.privacy_purge_access_logs` | `privacy.purge_access_logs` (diário) |
| Provas: consentimentos revogados, aceites e consentimentos de contas encerradas, pedidos fechados, AuditLog | `PROOF_RETENTION_DAYS` = 1825 dias, piso 365 (LEG-R03, OI-04) | `app.privacy_purge_proofs` | `privacy.purge_proofs` (diário) |
| Provas de reautenticação (ações destrutivas) | 2 minutos, uso único | Vencidas ou usadas, de todas as contas (PR1b-R2-B1) | `privacy.reauth_proofs_purge` (diário) |
| Sessões revogadas ou expiradas, tokens usados ou vencidos | 1 dia depois de perder a validade | `app.auth_purge_expired` | `auth.purge_expired` (a cada 6 h) |
| Contas com e-mail nunca verificado | 7 dias | Idem | `auth.purge_expired` |
| Segredo TOTP de ativação abandonada | 1 dia | Idem | `auth.purge_expired` |
| Backups do banco | `BACKUP_RETENTION_DAYS` = 30 dias, ≤ `PURGE_DAYS` (LEG-S07) | Expiração no provedor (Fase 7) | — |
| Cookies de preferência (`__Host-hm_period`, `__Host-hm_privacy`, `__Host-hm_presenting`) | Até fechar o navegador | Cookies de sessão, sem identificador | — |

Os jobs recorrentes usam `singletonKey` (várias instâncias não duplicam) e se reagendam ao terminar, mesmo após
falha. Payloads só com IDs; logs só com contagens (LEG-R04).

## Quanto tempo um dado pode sobreviver no pior caso

- **Revogação do consentimento de saúde:** carência (30 dias) + backups (≤ `PURGE_DAYS`, 30 dias) = até
  **60 dias** numa cópia de backup. Na base ativa, até 30 dias, sem nenhuma tela, gráfico ou resumo (só a
  exportação completa, OI-32).
- **Exclusão de conta:** minutos na base ativa + backups (≤ 30 dias) = até **30 dias** numa cópia de backup.
- **Arquivo de exportação:** até `EXPORT_LINK_HOURS` + 1 h (a execução seguinte do `reports.expire`).

## Onde a política é conferida

1. **Ambiente** (`parseEnv`, `src/lib/env.ts`): recusa subir com `BACKUP_RETENTION_DAYS > PURGE_DAYS`,
   `EXPORT_LINK_HOURS > 24`, `ACCESS_LOG_RETENTION_DAYS > 180` ou `PROOF_RETENTION_DAYS < 365`.
2. **Início dos jobs** (`assertRetentionPolicy`, `src/lib/retention.ts`): a mesma regra, de novo, antes de
   registrar qualquer job. Os tetos vêm de `RETENTION_LIMITS`, a fonte única usada também pelo `parseEnv`.
3. **CI** (`pnpm check:retention`): confere o `.env.example` e a política de backup declarada em
   `infra/retention.json` (cifrado, regiões no Brasil, retenção igual a `BACKUP_RETENTION_DAYS` e ≤ `PURGE_DAYS`,
   recuperação a um ponto no tempo dentro da retenção) e a regra de ciclo de vida do prefixo `exports/` do storage
   (`storage.exportsLifecycleDays`: pelo menos o link + 1 h, nunca além de `PURGE_DAYS`).
4. **Fase 7:** conferir `infra/retention.json` contra a configuração real do provedor de banco e de storage
   (OI-11), e aplicar no provedor a regra de ciclo de vida de `exports/`, rede de segurança para arquivo órfão
   (OI-35).

## Restauração de backup

Uma restauração pode trazer de volta contas excluídas ou dados de saúde já eliminados dentro do prazo dos
backups. Antes de liberar o acesso, reaplicar as eliminações: os pedidos `deletion` concluídos e os registros
`health_data_eliminated` do AuditLog (provas sem FK para `users`, LEG-R03) listam as contas. Passo a passo em
`docs/runbooks/BACKUP_RESTORE.md`.
