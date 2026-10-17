# Runbook — Credencial de quem atende pedidos (operador)

> **RASCUNHO.** Requisitos: LEG-D07, LEG-S03, LEG-S06. Decisões: ADR-0034, ADR-0036 D5, ADR-0037 (OI-34 b).
> Uso diário do atendimento: `DATA_SUBJECT_REQUEST.md`.

## Regras
- **Uma pessoa, um papel de login** `operador_<nome>` (minúsculas, números e `_`), membro do grupo `app_operator`
  (sem login). O grupo não lê nenhuma tabela: só executa as funções `app.operator_*`, e cada uma grava o papel de
  quem atendeu no AuditLog (`operator_role`).
- **Nunca reutilizar um nome**: o AuditLog ficaria ambíguo. Quem sai da função tem o papel removido, não renomeado.
- A credencial fica **só com a pessoa** (gerenciador de senhas pessoal ou `{{SEGREDOS}}`), nunca no runtime do app
  (o `parseEnv` recusa `OPERATOR_DATABASE_URL` em produção), nunca em chat, ticket ou repositório.
- Conexão só a partir de `{{ONDE_CONECTA}}` (bastion ou rede privada do provedor), com TLS.
- Teto de 30 leituras de contato por hora por pessoa e alerta `alert.operator_volume_anomaly` acima de 20 ações
  por hora (`ALERTS.md`).

## Criar a credencial de uma pessoa
Quem faz: o responsável pelo banco, conectado como dono (`app_migrator`) ou administrador do provedor.
1. Gerar uma senha forte (32+ caracteres aleatórios) e entregá-la à pessoa por canal seguro (`{{CANAL}}`).
2. Rodar (troque `<nome>` e `<senha>`; em dev isso é feito pelo `03-operator-role.sh` com `operador_dev`):
   ```sql
   CREATE ROLE operador_<nome> LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT
     PASSWORD '<senha>' VALID UNTIL '<data, no máximo 90 dias>';
   GRANT app_operator TO operador_<nome> WITH INHERIT TRUE, SET FALSE;
   GRANT CONNECT ON DATABASE healthmind TO operador_<nome>;
   ```
3. Conferir: `pnpm db:verify-roles` passa ("membros do app_operator são operador_<nome>, sem atributos e só nesse
   grupo"; "app_operator executa só app.operator_*").
4. A pessoa configura na própria máquina `OPERATOR_DATABASE_URL=postgresql://operador_<nome>:<senha>@<host>/healthmind?sslmode=require`
   e testa com `pnpm privacy:requests list`.
5. Registrar quem recebeu, quando e até quando vale (sem a senha).

## Trocar a senha (a cada 90 dias ou se houver suspeita)
```sql
ALTER ROLE operador_<nome> PASSWORD '<nova senha>' VALID UNTIL '<nova data>';
```
Entregar a nova senha pelo mesmo canal seguro. Se houver suspeita de vazamento, seguir `INCIDENT.md` e revisar no
AuditLog as ações com esse `operator_role` desde a última troca.

## Remover (a pessoa deixou a função)
```sql
REVOKE CONNECT ON DATABASE healthmind FROM operador_<nome>;
DROP ROLE operador_<nome>;
```
O AuditLog guarda só o nome, que não volta a ser usado. Num restore, os papéis são do servidor e não do backup:
recrie só os das pessoas que ainda atendem (`BACKUP_RESTORE.md`, parte 3).

## Pendente de decisão (CHECKLIST_GO_LIVE)
Se exclusões pedidas fora do app (`pnpm privacy:requests delete`) exigem conferência de uma segunda pessoa (OI-34).
