# Subprocessadores e serviços de terceiros

> **RASCUNHO — revisão jurídica obrigatória.** `LEGAL-REVIEW` · Versão 0.1 (Fase 0)
> Requisitos: LEG-S10 (residência no Brasil), LEG-D06 (informação sobre compartilhamento), LEG-I03.

Regra: banco, storage, filas, jobs **e execução das funções/servidores** ficam no Brasil. Todo serviço que
processe dados fora do Brasil — inclusive logs da hospedagem, e-mail, monitoramento de erros e LLM — precisa
constar aqui **antes** de ser ativado, com finalidade, região e dados envolvidos. Dados de saúde nunca são
vendidos nem compartilhados para vantagem econômica (LGPD art. 11, §4º).

## Produção (a definir — OPEN_ISSUES OI-11)

| Serviço | Fornecedor | Finalidade | Dados envolvidos | Região | Fora do Brasil? | DPA | Status |
|---|---|---|---|---|---|---|---|
| Hospedagem / execução das funções | `{{HOSPEDAGEM}}` | Servir o app e executar o servidor | Todos os dados em trânsito; logs técnicos (IP, requisição) | `{{REGIAO}}` (ex.: `gru1`) | Verificar inclusive logs da plataforma | `{{DPA}}` | A definir |
| Banco de dados gerenciado | `{{BANCO}}` | Armazenamento primário | Conta, dados de saúde (sensíveis, cifrados em campo onde aplicável), consentimentos | `{{REGIAO}}` (ex.: `sa-east-1`) | Não (exigido) | `{{DPA}}` | A definir |
| Backups | `{{BANCO}}` | Recuperação | Cópia cifrada do banco, retenção ≤ `PURGE_DAYS` | `{{REGIAO}}` | Não (exigido) | `{{DPA}}` | A definir |
| Storage de objetos | `{{STORAGE}}` | Exportações e relatórios (privados, link expira em 24h) | Arquivos de exportação | `{{REGIAO}}` | Não (exigido) | `{{DPA}}` | A definir |
| Fila / jobs | Mesmo banco de dados (`{{BANCO}}`), tabela `job_queue` (ADR-0019) | Lembretes, relatórios, exportações, purga | IDs de usuário e de registros (sem conteúdo) | `{{REGIAO}}` | Não (exigido) | `{{DPA}}` do banco | A definir |
| KMS | `{{KMS}}` | Chaves de criptografia de campo | Chaves; nenhum dado de usuário | `{{REGIAO}}` | Não (exigido) | `{{DPA}}` | A definir |
| E-mail transacional | `{{EMAIL}}` | Verificação, recuperação de senha, lembretes | E-mail, nome, links; **sem conteúdo de saúde** | `{{REGIAO}}` | Provável | `{{DPA}}` | A definir |
| Monitoramento de erros | `{{ERROS}}` | Diagnóstico técnico | Metadados técnicos, com remoção de PII (LEG-R04) | `{{REGIAO}}` | Provável | `{{DPA}}` | A definir |
| Provedor de LLM | `{{LLM}}` | HealthMind AI (somente com consentimento de IA, LEG-I01) | Agregados e trechos escolhidos pela pessoa (LEG-I02) | `{{REGIAO}}` | Provável → consentimento de transferência (LEG-C02 item 3) e art. 33 | `{{DPA}}`, sem treino, retenção zero/mínima (inclusive logs de abuso) com prazo documentado | A definir |

## Desenvolvimento e CI (sem dados pessoais de usuários)

| Serviço | Finalidade | Dados envolvidos | Região |
|---|---|---|---|
| GitHub (repositório, Actions, CodeQL, Dependabot) | Código-fonte, CI, varredura de segurança | Código e metadados de commits; **apenas dados sintéticos** (CLAUDE.md regra 6) | EUA |
| Registro npm / imagens Docker (postgres, semgrep, gitleaks) | Download de dependências e ferramentas | Nenhum dado de usuário | Global |
| Registro de regras do Semgrep | Download de regras públicas | Nenhum dado; executado com `--metrics=off` | Global |

Não usados: SDKs de publicidade, analytics de terceiros, fontes remotas (Google Fonts), telemetria do Next.js
(`NEXT_TELEMETRY_DISABLED=1`) e telemetria da CLI do Prisma (`CHECKPOINT_DISABLE=1`, no `.env` e na CI).
