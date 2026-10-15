# Relatório de Impacto à Proteção de Dados (RIPD) — LGPD art. 38

> **RASCUNHO — revisão jurídica obrigatória.** `LEGAL-REVIEW` · Versão 0.6 (retenção e modo privacidade, ADR-0035) · LEG-G02
> Controlador: `{{CONTROLADOR}}` · Encarregado: `{{ENCARREGADO}}` · Data: `{{DATA}}`

Revisar este relatório antes do lançamento e sempre que houver nova finalidade, integração (LEG-X04) ou
subprocessador.

## 1. Descrição do tratamento
- Natureza, escopo e contexto: ver `docs/INTENDED_USE.md` e `docs/privacy/ROPA.md`.
- Dados pessoais sensíveis de saúde e bem-estar, informados pela própria pessoa (adultos 18+).
- Fluxo de dados: navegador → servidor (Brasil) → banco (Brasil). Nenhum dado vai a provedor de IA (ADR-0030).
  Fora do Brasil, provavelmente, só e-mail transacional e monitoramento de erros, sem conteúdo de saúde (o envio
  de um lembrete pode indicar rotina, ROPA T7; OI-03).

## 2. Necessidade e proporcionalidade
- Minimização: só os campos necessários a cada módulo; resumos calculados por regras no próprio servidor.
- Base legal por operação (ROPA) e consentimento por finalidade, nunca pré-marcado (LEG-C02).
- Transparência: selo de origem em todo dado, Central de Privacidade, lista de subprocessadores.
- Direitos do titular: acesso, correção, portabilidade, eliminação, anonimização, revisão (LEG-D01–D08).

## 3. Riscos identificados
| # | Risco | Probabilidade | Impacto | Risco residual |
|---|---|---|---|---|
| R1 | Acesso indevido a dados de saúde de outro usuário | `{{}}` | Alto | `{{}}` |
| R2 | Vazamento por log, erro ou telemetria | `{{}}` | Alto | `{{}}` |
| R3 | ~~Envio à IA além do consentido ou do mínimo~~ **Encerrado (ADR-0030):** não há IA | — | — | — |
| R4 | Transferência internacional (e-mail transacional, monitoramento de erros) sem mecanismo adequado | `{{}}` | Médio | `{{}}` |
| R5 | Uso por menores de idade | `{{}}` | Alto | `{{}}` |
| R6 | Interpretação de conteúdo como orientação clínica | `{{}}` | Alto | `{{}}` |
| R7 | Retenção além do prazo (inclusive backups) | `{{}}` | Médio | `{{}}` |
| R8 | Dependência comprometida (cadeia de suprimentos) | `{{}}` | Alto | `{{}}` |
| R9 | Tratamento sem consentimento válido (pré-marcação, versão desatualizada, revogação ignorada) | `{{}}` | Alto | `{{}}` |
| R10 | Perda das provas de consentimento e de pedidos ao excluir contas | `{{}}` | Médio | `{{}}` |
| R11 | Dado fictício confundido com real (ou misturado aos dados da pessoa) | `{{}}` | Médio | `{{}}` |
| R12 | Índice de Bem-Estar lido como avaliação de saúde | `{{}}` | Alto | `{{}}` |
| R13 | Dado de saúde mantido após revogação além do prazo (eliminação incompleta) | `{{}}` | Alto | `{{}}` |
| R14 | Corpo 3D lido como avaliação corporal | `{{}}` | Alto | `{{}}` |
| R15 | Dano à imagem corporal ou incentivo a padrão alimentar restritivo (metas, alimentação, textos) | `{{}}` | Alto | `{{}}` |

## 4. Medidas de mitigação
| Risco | Medidas | Requisitos |
|---|---|---|
| R1 | RLS + `app_user` sem BYPASSRLS, `SET LOCAL app.user_id`, testes de isolamento | LEG-S03 |
| R2 | Logger só com metadados, ESLint proíbe `console`, remoção de PII em erros | LEG-R04 |
| R3 | Encerrado: sem IA nem provedor de LLM; finalidades de IA e transferência bloqueadas por CHECK no banco | ADR-0030 |
| R4 | Registro em SUBPROCESSORS antes de ativar, nenhum conteúdo de saúde nos serviços fora do Brasil (o lembrete por e-mail pode indicar rotina, ROPA T7), mecanismo do art. 33 sem consentimento do titular (ex.: cláusulas contratuais padrão), a definir no jurídico (OI-03) | LEG-S10, LEG-R04 |
| R5 | Age gate 18+ sem persistir dado do menor; linguagem não dirigida a menores | LEG-F01–F04 |
| R6 | Declaração de finalidade, avisos `disclaimer.*`, teste de alegações proibidas, resumos por regras fixas (sem IA nem recomendações automáticas); sem prescrição de dieta ou treino | LEG-M01, LEG-M03, LEG-M08, ADR-0030 |
| R7 | `PURGE_DAYS`, backup ≤ prazo de purga (validado no ambiente, no início dos jobs e na CI, com a política de backup declarada em `infra/retention.json`), expurgo de AccessLog, de provas e das provas de reautenticação vencidas; prazos e pior caso (até 60 dias em backup depois de revogar) em `docs/privacy/RETENTION.md` | LEG-D04, S07, R02, ADR-0035 |
| R8 | Auditoria de dependências, SAST, actions por SHA, builds nativos negados | LEG-S09 |
| R9 | Consentimento por finalidade nunca pré-marcado (teste), texto versionado com hash, `app.has_active_consent` no guard e no RLS, revogação vale na próxima operação (teste), reconsentimento em versão substancial | LEG-C01–C06, ADR-0019 |
| R10 | Provas sem FK para `users`, gatilhos contra alteração, teste da lista de FKs e do expurgo com provas presentes | LEG-R03, PR1a-R3-B8 |
| R11 | Demo gerado em memória, nunca gravado nas tabelas de saúde; selo DEMO em todo dado; indicador no cabeçalho e faixa no modo demo; demo público sem sessão nem escrita (teste e2e) | LEG-X02, ADR-0021 |
| R12 | Texto fixo "não é avaliação de saúde" (`disclaimer.wellbeingScore`), explicação dos critérios, sem classificação nem referência populacional, pedido de revisão | LEG-D08, LEG-M03, ADR-0021 |
| R13 | Toda tabela de saúde com eliminador registrado; teste pelo catálogo do banco que falha se alguma tabela não for zerada; DELETE só por dono, sem depender do consentimento; varredura diária reagenda eliminações perdidas; restauração de backup reaplica as eliminações (runbook) | LEG-D04, PR1b-B9, ADR-0021, ADR-0035 |
| R14 | Corpo só pelas medidas informadas (o peso não muda a forma), sem IMC no twin, cor neutra, diferenças em número, `disclaimer.bodyModel` sempre visível; nada persistido; testes de glossário e de ausência de IMC. O cérebro 3D saiu do produto (ADR-0027) | LEG-M04, LEG-M06, LEG-M03, ADR-0026 |
| R15 | Guardrails em módulo puro testado (`src/modules/guardrails`: IMC mínimo da meta, ritmo máximo de perda, piso calórico), aviso sem números restritivos com orientação profissional e apoio CVV 188 / SAMU 192 (fixo na tela de corpo e quando um guardrail de segurança dispara), acesso permanente "Precisa de ajuda?", sem recomendações automáticas nem IA (ADR-0030), glossário de imagem corporal e alimentação (corpo ideal, juízo sobre o corpo, queima de gordura, rótulo de comida, restrição e jejum, culpa, prescrição; Fase 4: rótulo "saudável/pesada/leve", prescrição de treino e contabilidade de calorias); Índice sem peso ou medidas. Fase 4 (ADR-0029): `checkGoal` no servidor com dados do banco e piso calórico também no banco; estimativa calórica desligada por padrão e meta de calorias só com ela; metas de peso sem barra, sequência, comemoração ou marco; sem calorias gastas na atividade; progressão só em relação ao próprio histórico. Pendente: limiares em revisão clínica (OI-23) e modo de ocultar peso e medidas em todas as telas (Fase 6) | LEG-M04, LEG-M06, LEG-M07, LEG-M08, ADR-0027, ADR-0030 |

## 5. Parecer do encarregado
`{{PARECER_ENCARREGADO}}`

## 6. Aprovação
`{{RESPONSAVEL}}` · `{{DATA_APROVACAO}}`
