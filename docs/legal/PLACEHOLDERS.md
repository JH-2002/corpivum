# Placeholders `{{...}}` — catálogo único

> **RASCUNHO.** `LEGAL-REVIEW` · LEG-G04 · ADR-0041. Todo `{{NOME}}` usado em `docs/`, `messages/`, `legal/` e
> `infra/` precisa estar nesta tabela; o teste `tests/content/placeholders.test.ts` falha com placeholder fora do
> catálogo, vazio (`{{}}`) ou fora do formato `MAIÚSCULAS_COM_SUBLINHADO`, e com linha do catálogo que nada usa.

Como preencher: quando a decisão for tomada, troque o placeholder pelo valor em **todos** os arquivos (busca por
`{{NOME}}`) e apague a linha daqui. Nos textos versionados (Política, Termos, consentimentos em `messages/`), trocar o
placeholder muda o texto: é uma versão nova (`policy_versions`, ADR-0019 e ADR-0031) e entra no aviso aos usuários.
Nos textos i18n o placeholder aparece entre aspas simples (`'{{CONTROLADOR}}'`), a forma de escapar chaves no ICU.

## Pessoas e organização

| Placeholder | O que é | Quem decide | Onde aparece |
|---|---|---|---|
| `{{CONTROLADOR}}` | Pessoa física ou jurídica responsável pelo app (decide a aplicação do art. 15 do Marco Civil) | Responsável pelo produto, com o jurídico | Política, Termos, consentimento de saúde, ROPA, RIPD, INTENDED_USE, SUBPROCESSORS, PENTEST_SCOPE |
| `{{ENCARREGADO}}` | Nome do encarregado (DPO), art. 41 | Controlador | Política, página do encarregado, ROPA, RIPD, INTENDED_USE, SUBPROCESSORS, INCIDENT |
| `{{CONTATO_ENCARREGADO}}` | Canal público do encarregado (e-mail ou formulário) | Controlador | Política, Termos, página do encarregado, ROPA, SUBPROCESSORS, INCIDENT, DATA_SUBJECT_REQUEST |
| `{{FORO}}` | Foro dos Termos de Uso | Jurídico | Termos |
| `{{JURIDICO}}` | Escritório ou pessoa do jurídico | Controlador | INCIDENT |
| `{{CONTATO_JURIDICO}}` | Contato do jurídico em incidente | Controlador | INCIDENT |
| `{{RESPONSAVEL_INCIDENTE}}` | Quem coordena um incidente | Controlador | INCIDENT |
| `{{CONTATO_INCIDENTE}}` | Contato de plantão de quem coordena o incidente | Controlador | INCIDENT, PENTEST_SCOPE |
| `{{RESPONSAVEL_TECNICO}}` | Contato técnico do pentest | Responsável pelo produto | PENTEST_SCOPE |
| `{{PENTEST}}` | Empresa de pentest | Controlador | PENTEST_SCOPE |
| `{{PARECER_ENCARREGADO}}` | Parecer do encarregado sobre o RIPD | Encarregado | RIPD |
| `{{RESPONSAVEL_APROVACAO}}` | Quem aprova o RIPD | Controlador | RIPD |

## Fornecedores e regiões (OI-11)

| Placeholder | O que é | Quem decide | Onde aparece |
|---|---|---|---|
| `{{HOSPEDAGEM}}` | Hospedagem do servidor web, do worker e dos logs | Responsável pelo produto | SUBPROCESSORS, `infra/regions.json`, INCIDENT, PENTEST_SCOPE |
| `{{BANCO}}` | PostgreSQL gerenciado (também backups e fila) | Responsável pelo produto | SUBPROCESSORS, `infra/regions.json`, BACKUP_RESTORE |
| `{{STORAGE}}` | Storage de objetos das exportações | Responsável pelo produto | SUBPROCESSORS, `infra/regions.json`, ROPA |
| `{{STORAGE_LIVRO}}` | Storage só de acréscimo dos livros de reaplicação | Responsável pelo produto | SUBPROCESSORS, `infra/regions.json`, BACKUP_RESTORE, ROPA |
| `{{KMS}}` | Serviço de chaves da criptografia de campo | Responsável pelo produto | SUBPROCESSORS, `infra/regions.json`, KEY_ROTATION, BACKUP_RESTORE, THREAT_MODEL |
| `{{SEGREDOS}}` | Gerenciador de segredos | Responsável pelo produto | SUBPROCESSORS, `infra/regions.json`, runbooks, THREAT_MODEL |
| `{{EMAIL}}` | Provedor de e-mail transacional | Responsável pelo produto | SUBPROCESSORS, `infra/regions.json`, ROPA |
| `{{ERROS}}` | Ferramenta de monitoramento de erros (ou o próprio log da hospedagem) | Responsável pelo produto | SUBPROCESSORS, `infra/regions.json`, ROPA |
| `{{DPA}}` | Contrato de tratamento de dados assinado com cada fornecedor | Controlador, com o jurídico | SUBPROCESSORS |
| `{{REGIAO}}` | Região no Brasil de cada fornecedor (ex.: `gru1`, `sa-east-1`) | Responsável pelo produto | SUBPROCESSORS, PENTEST_SCOPE |
| `{{REGIAO_WORKER}}` | Região do serviço do worker | Responsável pelo produto | WORKER_DEPLOY |

## Prazos

| Placeholder | O que é | Quem decide | Valor implementado hoje |
|---|---|---|---|
| `{{RETENCAO_ACESSO}}` | Guarda dos registros de acesso (Marco Civil, art. 15) | Jurídico (OI-06, OI-17) | `ACCESS_LOG_RETENTION_DAYS` = 180 dias |
| `{{RETENCAO_PROVA}}` | Guarda das provas de consentimento e de pedidos | Jurídico (OI-04) | `PROOF_RETENTION_DAYS` = 1825 dias (5 anos), piso técnico de 365 |
| `{{PRAZO_BACKUP}}` | Prazo para as cópias de segurança serem substituídas | Responsável pelo produto, com o jurídico | `BACKUP_RETENTION_DAYS` = 30 dias, ≤ `PURGE_DAYS` |
| `{{RETENCAO_METRICAS}}` | Guarda das métricas de uso, se forem ativadas | Responsável pelo produto | Nada é coletado (ROPA T9) |
| `{{RETENCAO_LOGS}}` | Guarda dos logs da hospedagem | Responsável pelo produto, com a hospedagem | Configuração do provedor |
| `{{PRAZO_ANPD}}` | Prazo de comunicação de incidente à ANPD | Jurídico (OI-05) | — |
| `{{FREQUENCIA_BACKUP}}` | Frequência dos backups no provedor (no mínimo diária) | Responsável pelo produto | PITR de 7 dias declarado em `infra/retention.json` |
| `{{PERIODICIDADE_ROTACAO}}` | Rotação programada de chaves e credenciais | Responsável pelo produto | — (operadores: 90 dias) |

## Procedimentos que dependem do provedor

| Placeholder | O que é | Onde aparece |
|---|---|---|
| `{{COMO_PITR}}` | Como pedir a recuperação a um ponto no tempo | BACKUP_RESTORE |
| `{{COMO_PARAR}}` | Como parar web e worker | BACKUP_RESTORE |
| `{{COMO_RESTAURAR}}` | Como restaurar em instância nova e isolada | BACKUP_RESTORE |
| `{{COMO_SEM_INGRESSO}}` | Como deixar o worker sem entrada pública | WORKER_DEPLOY |
| `{{REDE_PRIVADA}}` | Rede privada do banco | PROVISIONING |
| `{{ONDE_CONECTA}}` | De onde os operadores se conectam ao banco (bastion ou rede privada) | OPERATOR_CREDENTIALS |
| `{{CANAL_SEGURO}}` | Canal para entregar a senha a quem atende pedidos | OPERATOR_CREDENTIALS |
| `{{SUPORTE_HOSPEDAGEM}}` | Canal de suporte da hospedagem em incidente | INCIDENT |
| `{{MODELO_COMUNICACAO}}` | Textos-modelo de comunicação de incidente | INCIDENT (jurídico) |

## Datas e versões

| Placeholder | O que é | Onde aparece |
|---|---|---|
| `{{DATA_RIPD}}` | Data da versão do RIPD avaliada pelo encarregado | RIPD |
| `{{DATA_APROVACAO}}` | Data da aprovação do RIPD | RIPD |
| `{{JANELA_PENTEST}}` | Janela de testes do pentest | PENTEST_SCOPE |
| `{{COMMIT_PENTEST}}` | Commit testado no pentest | PENTEST_SCOPE |
