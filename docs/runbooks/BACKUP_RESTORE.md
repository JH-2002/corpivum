# Runbook — Backup e restauração

> **RASCUNHO.** Requisitos: LEG-S07, LEG-D04, LEG-R03, LEG-S10. Decisões: ADR-0035, ADR-0040. O provedor de banco
> ainda não foi escolhido (OI-11): a parte 3 tem `{{...}}` que se preenchem com ele.

## Regras
- Backups **cifrados**, na mesma região (Brasil, LEG-S10; `infra/regions.json`, componente `backups`).
- **Retenção ≤ `PURGE_DAYS`** (padrão 30 dias): dado excluído não sobrevive em backup além do prazo de purga.
  `parseEnv`, `assertRetentionPolicy` e `pnpm check:retention` conferem (`infra/retention.json`, ADR-0035).
- **Restauração nunca libera o acesso antes da reaplicação** (parte 4): sem ela, contas excluídas, consentimentos
  revogados e dados de saúde eliminados depois do backup voltariam (P7-M3).
- Ensaio de restauração periódico em banco isolado, nunca com dados reais em desenvolvimento (CLAUDE.md regra 6).
- Nunca copiar dados de linha para o registro, ticket ou chat: só datas, contagens e resultados.

## Configuração
| Item | Valor |
|---|---|
| Provedor | `{{BANCO}}` (região `sa-east-1`, `infra/regions.json`) |
| Frequência | `{{FREQUENCIA_BACKUP}}` (diário, no mínimo) |
| Retenção | `BACKUP_RETENTION_DAYS` = 30 dias (≤ `PURGE_DAYS`) |
| Recuperação a um ponto no tempo (PITR) | 7 dias (`infra/retention.json`, `pointInTimeRecoveryDays`) |
| Criptografia do provedor | `{{KMS}}` |
| Arquivos do ensaio local (`pnpm backup:*`) | AES-256-GCM com `BACKUP_ENCRYPTION_KEY` (32 bytes, só para isso) |
| Livro de reaplicação fora do banco | `pnpm backup:ledger`, de hora em hora, em storage só de acréscimo (`{{STORAGE_LIVRO}}`, CHECKLIST) |

## 1. Os comandos
| Comando | O que faz |
|---|---|
| `pnpm backup:create` | Dump cifrado do banco de `MIGRATION_DATABASE_URL` em `.backups/`, com as contagens por tabela tiradas no mesmo instante (mesmo snapshot). O conteúdo nunca toca o disco sem cifra. |
| `pnpm backup:ledger` | Livro cifrado do que mudou desde o backup mais antigo ainda guardado: identidade da instalação, ids e estado das contas (sem e-mail) e as provas (consentimentos, aceites, pedidos, AuditLog, registros de acesso). Nenhum dado de saúde. Conecta com o papel `app_backup` (`BACKUP_DATABASE_URL`), que só lê o livro. |
| `pnpm backup:restore <arquivo> --source` | Confere o arquivo inteiro, restaura num banco **isolado** `<banco>_restore`, confere as contagens, aplica as migrações, roda `db:verify-roles` e reaplica o que mudou depois do backup lendo a origem. |
| `pnpm backup:restore <arquivo> --ledger <livro>` | Igual, mas lê as mudanças de um livro (origem perdida). |
| `pnpm backup:restore <arquivo> --no-source` | Igual, sem reaplicar mudanças (só zera acessos). Use só quando não há origem nem livro, e registre a perda. |
| `pnpm backup:reapply --since <data>` | Só a reaplicação, num banco restaurado pelo provedor (parte 3). |
| `pnpm backup:drop <banco>_restore` | Destrói o banco isolado. |
| `--dry-run` (em `restore` e `reapply`) | Mostra o plano (contas a encerrar, não verificadas a remover, eliminações de saúde) e para sem reaplicar. |
| `--confirm-closures <total>` | Exigido quando as remoções passam de max(5, 1% das contas restauradas): confira a origem e repita o total do plano. |

O banco restaurado **recusa** a reaplicação quando: o livro é de outra instalação (cada banco tem uma identidade
própria, que vai no backup); o livro foi lido antes do ponto do backup; o livro começa depois do ponto (menos 1
hora de margem para transações em curso); ou o acesso já foi liberado (alguém entrou depois da reaplicação deste
restore). O terminal mostra só contagens e mensagens fixas; a saída do `pg_restore`, do `psql` e do Prisma pode citar
valores de linha e só vai para `.backups/<nome>` se você definir `BACKUP_DEBUG_LOG=<nome>.log` (apague o arquivo
depois de ler).

A primeira reaplicação fixa o ponto do restore: o banco recusa um `--since` anterior aos dados restaurados (com 5
minutos de tolerância de relógio) e, depois, qualquer `--since` diferente do primeiro. **Backups anteriores à migração
`fase_7e_revisao`** (os primeiros 30 dias depois do deploy dela) não têm a identidade da instalação: o
`migrate deploy` cria uma nova e todo livro é recusado. Nesse caso, use `--no-source` e registre a perda (7e-N3).

`create`, `restore` e `drop` usam o Postgres do `docker compose` (desenvolvimento, CI e ensaio). O teste
`tests/db/backup.test.ts` roda tudo isso na CI (job "Banco") a cada PR.

## 2. Ensaio de restauração no computador (passo a passo)
Use quando quiser ver a restauração funcionando, ou para o ensaio periódico antes de ter o provedor. Só com dados
sintéticos.

1. **Banco ligado:** `pnpm db:up`. Confira que o `.env` tem `BACKUP_ENCRYPTION_KEY` preenchida (gere uma com
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).
2. **Dados de exemplo (opcional):** `pnpm db:seed` cria uma pessoa fictícia com 90 dias de registros.
3. **Fazer o backup:** `pnpm backup:create`. A saída mostra o arquivo (`.backups/healthmind-<data>.hmbk`), o
   **ponto do backup** (anote) e quantas tabelas e linhas entraram.
4. **Simular o que acontece depois do backup (opcional):** entre no app (`pnpm dev`), exclua uma conta de teste,
   revogue uma autorização. No ensaio, essas mudanças precisam ser reaplicadas.
5. **Restaurar:** `pnpm backup:restore .backups/healthmind-<data>.hmbk --source`. Você deve ver, nesta ordem:
   - `Backup de healthmind, ponto ... Restaurando em healthmind_restore (isolado).`
   - `Contagens conferidas: N tabelas iguais ao backup.`
   - `Migrações aplicadas e papéis conferidos (db:verify-roles).`
   - `Plano: ... contas a encerrar, ... não verificadas a remover ...` (confira se os números fazem sentido;
     para só ver o plano, acrescente `--dry-run`)
   - `Reaplicado: ... contas purgadas, ... sessões revogadas ...`
   - `Pronto. Banco restaurado: healthmind_restore.`
   Se qualquer etapa falhar, o comando para com `Falha:` e o motivo; nada é liberado.
6. **Conferir sem olhar conteúdo:** as contas excluídas no passo 4 não existem em `healthmind_restore`; o banco da
   aplicação (`healthmind`) não foi tocado.
7. **Registrar** na tabela da parte 6 (data, duração, resultado, quem fez).
8. **Destruir:** `pnpm backup:drop healthmind_restore` e apague o arquivo em `.backups/` se não for mais usar.

Se o comando recusar o arquivo com `arquivo alterado ou chave errada`, o arquivo foi modificado ou a
`BACKUP_ENCRYPTION_KEY` não é a mesma de quando ele foi feito: não há como abrir sem a chave certa.

## 3. Restauração no provedor (produção)
Preencher com o provedor (OI-11). A ordem não muda:
1. **Decidir o ponto.** Incidente com dano lógico (exclusão em massa, corrupção): PITR até **um pouco antes** do
   incidente (`{{COMO_PITR}}`). Perda do banco: o backup mais recente. Anote o ponto (data e hora UTC).
2. **Bloquear o acesso:** instâncias web e worker paradas (`{{COMO_PARAR}}`); a origem, se ainda existir, fica
   só para leitura do livro (nenhuma escrita nova).
3. **Restaurar em instância nova e isolada** no Brasil (`{{COMO_RESTAURAR}}`), sem tráfego.
4. **Papéis:** os papéis do Postgres são do servidor, não do backup. Crie `app_migrator`, `app_user`, `app_worker`,
   `app_backup` e o grupo `app_operator` como em `PROVISIONING.md` (passo 3), com senhas **novas** do gerenciador
   de segredos.
5. **Migrações e papéis:** `pnpm db:deploy` e `pnpm db:verify-roles` com as URLs da instância restaurada.
6. **Reaplicação** (parte 4), com `RESTORE_MIGRATION_DATABASE_URL` e `RESTORE_WORKER_DATABASE_URL` apontando para
   a instância restaurada e `BACKUP_DATABASE_URL` (`app_backup`) para a origem. Rode antes com `--dry-run` e confira
   o plano com o responsável pelo incidente:
   - origem acessível: `pnpm backup:reapply --since <ponto> --source`;
   - origem perdida: baixe o livro mais recente (`{{STORAGE_LIVRO}}`) e rode
     `pnpm backup:reapply --since <ponto> --ledger <livro>`;
   - sem origem nem livro: `--no-source` e registre a perda (parte 5).
7. **Trocar a conexão** do app para a instância restaurada, subir **primeiro o worker** (os jobs de purga, expurgo
   e `reports.expire` rodam na subida) e depois a web.
8. **Comunicar:** todos precisam entrar de novo (sessões zeradas). Quem trocou a senha depois do ponto restaurado
   volta à senha antiga: oriente a redefinição (parte 5). Se for incidente, siga `INCIDENT.md`.
9. **Registrar** (parte 6) e destruir a instância antiga só depois da decisão do responsável pelo incidente.

## 4. O que a reaplicação faz (P7-M3)
Em ordem, antes de qualquer acesso (`src/modules/privacy/restore.ts`, funções `app.restore_*` da migração
`fase_7e_operacao`, executáveis só pelo `app_migrator`):
1. **Provas da origem** copiadas com as datas originais: revogações de consentimento, aceites, pedidos do titular,
   AuditLog e registros de acesso posteriores ao backup (LEG-R03, LEG-C04).
2. **Contas que não existem mais na origem** (excluídas, encerradas como menor, expiradas sem onboarding) ou que lá
   estão excluídas: acesso cortado e purga normal (`app.account_purge` e eliminadores de todas as tabelas de
   saúde). As **não verificadas** saem direto, como no `auth.purge_expired` (LEG-D04, LEG-F04).
3. **Dados de saúde eliminados na origem** depois do backup saem de novo, mesmo que a pessoa tenha voltado a
   autorizar (tudo o que o backup tem é anterior à eliminação). O agendamento de eliminação pendente acompanha a
   origem (revogação nova agenda; reconsentir cancela).
4. **Provas copiadas de novo** (a purga mexe no pedido de encerramento; a origem prevalece).
5. **Sempre:** todas as sessões revogadas, tokens e provas de reautenticação apagados, links de exportação
   vencidos (o `reports.expire` apaga os arquivos), expurgo de autenticação e AuditLog `restore_reapplied` com o
   papel de quem rodou.

Arquivos do storage não estão no backup do banco: os de contas que não existem mais saem pela varredura de órfãos
do `reports.expire` (OI-35) e pela regra de ciclo de vida do prefixo `exports/` no provedor.

## 5. O que se perde (residual, OPEN_ISSUES 7e-R1)
- **Sem origem nem livro:** tudo entre o ponto restaurado e o incidente — exclusões, encerramentos, revogações e
  as provas delas. Mitigação: PITR até pouco antes do incidente (janela de minutos) e o livro de hora em hora fora
  do banco (perda de até 1 hora). Registre o intervalo perdido e trate como incidente (`INCIDENT.md`): avise as
  pessoas afetadas, se identificáveis pelos e-mails de aviso já enviados (`account-deleted`), e reprocesse os
  pedidos que chegarem de novo.
- **Com livro:** mudanças depois da leitura do livro (até 1 hora).
- **Sempre:** dados de bem-estar registrados depois do ponto restaurado, trocas de senha e de 2º fator (a senha
  antiga volta; sessões e tokens já foram zerados) e pedidos novos que ainda não estavam no livro.
- **Sempre (7e-R2):** registros de bem-estar que a pessoa **apagou ou corrigiu** depois do ponto restaurado voltam
  como estavam (uma refeição apagada, uma medida corrigida, uma nota editada): o livro só cobre contas, provas e
  eliminações completas. Avise as pessoas ativas no intervalo para conferirem os registros recentes.

## 6. Registro dos ensaios e restaurações
| Data | Tipo (ensaio/real) | Ponto restaurado | Duração | Resultado | Reaplicação | Responsável |
|---|---|---|---|---|---|---|
| | | | | | | |
