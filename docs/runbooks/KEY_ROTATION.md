# Runbook — Rotação de chaves e segredos

> **RASCUNHO.** Requisitos: LEG-S02, LEG-S07. A criptografia de campo é implementada na Fase 1a. Inventário
> revisado na 7f (P7-B8, ADR-0041).

## Inventário
| Segredo | Onde fica | Rotação | Impacto |
|---|---|---|---|
| Chave mestra (KEK) do KMS | `{{KMS}}` (produção); `KMS_LOCAL_MASTER_KEY` só em dev | `{{PERIODICIDADE_ROTACAO}}` ou em incidente | Recifrar as DEKs do banco; a KEK antiga continua só para decifrar (ver abaixo) |
| Credenciais do banco: `app_user` (web e worker), `app_worker` (só o worker), `app_migrator` (só máquinas de operação), `app_backup` (só o livro de reaplicação) | Gerenciador de segredos `{{SEGREDOS}}` | `{{PERIODICIDADE_ROTACAO}}` ou em incidente | Reinício de quem usa a credencial |
| Papéis `operador_<nome>` (uma pessoa cada) | Com a própria pessoa (`OPERATOR_CREDENTIALS.md`) | A cada 90 dias e quando a pessoa sai | Nenhum para o app |
| `SESSION_SECRET` | `{{SEGREDOS}}` | Em incidente | Cookies `hm_age_ok` e de aparelho conhecido deixam de valer (só disponibilidade); sessões continuam |
| `RATE_LIMIT_SECRET` | `{{SEGREDOS}}` | Em incidente | Zera as janelas de limite em andamento |
| `RECOVERY_CODE_PEPPER` | `{{SEGREDOS}}` | Só se vazar | Invalida todos os códigos de recuperação do MFA |
| Chave do provedor de e-mail | `{{SEGREDOS}}` | `{{PERIODICIDADE_ROTACAO}}` | Nenhum |
| `BACKUP_ENCRYPTION_KEY` (arquivos de `pnpm backup:*` e livros de reaplicação, ADR-0040) | `{{SEGREDOS}}`, fora do provedor dos backups | Em incidente | Arquivos antigos só abrem com a chave antiga: guardá-la até o último arquivo cifrado com ela vencer (`BACKUP_RETENTION_DAYS`) e só então destruir |

Segredos **nunca** no repositório (CLAUDE.md regra 6; gitleaks na CI).

## Rotação da chave mestra (envelope)
Cada valor cifrado guarda a DEK cifrada e o `keyId` da KEK que a cifrou.

> **Ainda não implementado (CHECKLIST, etapa 2.4).** O `KmsProvider` local aceita um único `keyId` e não existe
> job de recifragem no repositório. Os passos abaixo valem para o KMS real, que precisa decifrar com vários `keyId`,
> e para um script de recifragem testado, ambos a construir junto com o adaptador real.

### Rotação programada (sem suspeita de vazamento)
1. Criar a nova KEK no KMS (novo `keyId`); manter a antiga ativa só para decifrar.
2. Novas gravações passam a usar a nova KEK.
3. Recifragem: para cada DEK com `keyId` antigo, decifrar com a KEK antiga e cifrar com a nova (os dados em si
   não precisam ser recifrados, porque a DEK não vazou).
4. Confirmar que nenhuma DEK **do banco** usa o `keyId` antigo e desativar a KEK antiga para cifrar.
   - **Arquivos de exportação** (`exports/<pessoa>/<pedido>.bin`): o envelope fica dentro do arquivo, fora do
     banco, e a recifragem não os alcança. Vivem no máximo `EXPORT_LINK_HOURS` + 1 h (e 2 dias pela regra de ciclo
     de vida): basta esperar esse prazo.
   - **Backups do banco:** os campos cifrados dentro deles têm DEKs envolvidas pela KEK antiga. **Só destruir a KEK
     antiga depois de `BACKUP_RETENTION_DAYS`** contados do fim da recifragem; antes disso, uma restauração não
     conseguiria decifrar os campos. Os livros de reaplicação não têm campos cifrados em campo (usam só a
     `BACKUP_ENCRYPTION_KEY`) e não dependem da KEK.
5. Registrar data, `keyId` antigo/novo e responsável (sem material de chave no registro).

### Comprometimento da KEK (vazamento ou suspeita)
Reenvolver as DEKs **não basta**: quem tem a KEK antiga e uma cópia do banco (dump ou backup) já abre as DEKs.
1. Abrir incidente (`INCIDENT.md`) e criar a nova KEK.
2. Gerar **DEKs novas e recifrar os próprios dados** com elas (não só reenvolver as DEKs antigas).
3. Assim que a recifragem terminar, desativar a KEK antiga no KMS também para decifrar.
4. Tratar como comprometidos os backups e arquivos de exportação cifrados sob a KEK antiga: avaliar no incidente
   (RIPD e comunicação), apagar os que não forem indispensáveis e não restaurar deles sem decisão registrada.

## Segredos de autenticação (ADR-0014, ADR-0017, ADR-0037)
- `SESSION_SECRET`: assina o cookie `hm_age_ok` (os em curso expiram em até 30 min) e o cookie de aparelho
  conhecido `__Host-hm_device` (ADR-0019): girar invalida todos, e cada pessoa volta a contar no limite por conta
  até o próximo login completo (efeito só de disponibilidade). Não afeta os códigos de recuperação.
- `RECOVERY_CODE_PEPPER` (ADR-0037, PR1a-B3): pepper dos códigos de recuperação do MFA. **Girá-lo invalida todos
  os códigos de recuperação.** Gire só se ele vazar; depois, avise as pessoas com MFA ativo para gerarem códigos
  novos em Configurações › Segurança da conta (o TOTP continua valendo).
- `RATE_LIMIT_SECRET`: chave HMAC dos limites de tentativa. Girar só zera as janelas em andamento.
- Sessões não dependem desses segredos: o banco guarda só o hash do token. Para derrubar todas as sessões
  num incidente, use `UPDATE sessions SET revoked_at = now() WHERE revoked_at IS NULL` como `app_migrator`.

## Em incidente
Seguir `INCIDENT.md`: revogar sessões, rotacionar imediatamente os segredos expostos e, se a KEK vazou, seguir
"Comprometimento da KEK" acima (DEKs novas e dados recifrados).
