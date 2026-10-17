# Subprocessadores e serviços de terceiros

> **RASCUNHO — revisão jurídica obrigatória.** `LEGAL-REVIEW` · Versão 0.4 (governança da Fase 7, ADR-0041)
> Requisitos: LEG-S10 (residência no Brasil), LEG-D06 (informação sobre compartilhamento).
> Controlador: `{{CONTROLADOR}}` · Encarregado: `{{ENCARREGADO}}` · Contato: `{{CONTATO_ENCARREGADO}}`

Regra: banco, storage, filas, jobs **e execução das funções/servidores** ficam no Brasil. Todo serviço que
processe dados fora do Brasil — inclusive logs da hospedagem, e-mail e monitoramento de erros — precisa
constar aqui **antes** de ser ativado, com finalidade, região e dados envolvidos. Dados de saúde nunca são
vendidos nem compartilhados para vantagem econômica (LGPD art. 11, §4º).

Fonte técnica das regiões: `infra/regions.json`, conferido na CI por `pnpm check:infra` (ADR-0040). A página
pública `/legal/subprocessadores` espelha a tabela de produção, na mesma ordem (teste
`src/modules/privacy/subprocessors.test.ts`).

## Produção (a definir — OPEN_ISSUES OI-11)

| Serviço | Fornecedor | Finalidade | Dados envolvidos | Região | Fora do Brasil? | DPA | Status |
|---|---|---|---|---|---|---|---|
| Hospedagem / execução das funções | `{{HOSPEDAGEM}}` | Servir o app, executar o servidor web e o worker dedicado dos jobs | Todos os dados em trânsito; logs técnicos (IP, requisição, saída do processo filtrada, ADR-0038) | `{{REGIAO}}` (ex.: `gru1`) | Não (exigido, inclusive os logs da plataforma) | `{{DPA}}` | A definir |
| Banco de dados gerenciado | `{{BANCO}}` | Armazenamento primário | Conta, dados de bem-estar (sensíveis, cifrados em campo onde aplicável), consentimentos e provas | `{{REGIAO}}` (ex.: `sa-east-1`) | Não (exigido) | `{{DPA}}` | A definir |
| Backups | `{{BANCO}}` | Recuperação | Cópia cifrada do banco, retenção ≤ `PURGE_DAYS`, PITR (`infra/retention.json`) | `{{REGIAO}}` | Não (exigido) | `{{DPA}}` | A definir |
| Storage de objetos | `{{STORAGE}}` | Exportações e relatórios (privados, link expira em 24 h) | Arquivos de exportação cifrados | `{{REGIAO}}` | Não (exigido) | `{{DPA}}` | A definir |
| Livros de reaplicação | `{{STORAGE_LIVRO}}` | Reaplicar exclusões, revogações e provas depois de restaurar um backup (ADR-0040) | Arquivo cifrado com IDs de contas, estado da conta e provas (sem e-mail nem dado de bem-estar) | `{{REGIAO}}` | Não (exigido) | `{{DPA}}` | A definir |
| Fila / jobs | Mesmo banco de dados (`{{BANCO}}`), tabela `job_queue` (ADR-0019) | Lembretes, relatórios, exportações, purga e retenção | IDs de usuário e de registros (sem conteúdo) | `{{REGIAO}}` | Não (exigido) | `{{DPA}}` do banco | A definir |
| KMS | `{{KMS}}` | Chaves de criptografia de campo | Chaves; nenhum dado de usuário | `{{REGIAO}}` | Não (exigido) | `{{DPA}}` | A definir |
| Gerenciador de segredos | `{{SEGREDOS}}` | Guardar credenciais do banco, segredos do app e a chave dos backups | Segredos; nenhum dado de usuário | `{{REGIAO}}` | Não (exigido) | `{{DPA}}` | A definir |
| E-mail transacional | `{{EMAIL}}` | Confirmação de cadastro, aviso de "conta já existe", redefinição de senha, alertas de segurança, recibos de pedidos do titular, aviso de exclusão de conta, aviso de prazo da conta sem onboarding e lembretes | Endereço de e-mail, tipo de aviso, links e datas; **sem nome (o app não coleta) e sem conteúdo de bem-estar**; um lembrete pode indicar rotina (ROPA T7) | `{{REGIAO}}` | Provável | `{{DPA}}` | A definir |
| Monitoramento de erros | `{{ERROS}}` | Diagnóstico técnico | Relatório montado por lista de campos permitidos (nome e código do erro, rota como arquivo, quadros sem pasta), **sem mensagem nem dado de usuário** (LEG-R04, ADR-0038) | `{{REGIAO}}` | Provável | `{{DPA}}` | A definir; até a escolha, o relatório fica no log da hospedagem |

E-mails de novidades (finalidade `marketing`) só passam pelo mesmo provedor de e-mail depois que ele for escolhido e
listado aqui; hoje o app não envia nenhum.

## Desenvolvimento e CI (sem dados pessoais de usuários)

| Serviço | Finalidade | Dados envolvidos | Região |
|---|---|---|---|
| GitHub (repositório, Actions, CodeQL, Dependabot) | Código-fonte, CI, varredura de segurança | Código e metadados de commits; **apenas dados sintéticos** (CLAUDE.md regra 6) | EUA |
| Registro npm / imagens Docker (postgres, semgrep, gitleaks) | Download de dependências e ferramentas | Nenhum dado de usuário | Global |
| Registro de regras do Semgrep | Download de regras públicas | Nenhum dado; executado com `--metrics=off` | Global |

## Histórico
- Reorientação (ADR-0027): nenhum subprocessador novo nem removido; menos categorias de dado passam pelos mesmos
  provedores (sem humor, diário e medicamentos).
- Remoção da IA (ADR-0030): sai o provedor de LLM. Nenhum dado é enviado a modelo de linguagem, dentro ou fora do
  Brasil. Os únicos serviços com provável tratamento fora do Brasil são e-mail transacional e monitoramento de
  erros, sem conteúdo de saúde; o envio de um lembrete pode indicar rotina (ROPA T7, OPEN_ISSUES OI-03).
- Fase 7 (ADR-0040, ADR-0041): entram o livro de reaplicação e o gerenciador de segredos, ambos no Brasil; a
  finalidade do e-mail lista todos os avisos; o e-mail não leva nome (P7-B10).

Não usados: SDKs de publicidade, analytics de terceiros, fontes remotas (Google Fonts), telemetria do Next.js
(`NEXT_TELEMETRY_DISABLED=1`) e telemetria da CLI do Prisma (`CHECKPOINT_DISABLE=1`, no `.env` e na CI).
