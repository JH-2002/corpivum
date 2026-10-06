# Relatório de Impacto à Proteção de Dados (RIPD) — LGPD art. 38

> **RASCUNHO — revisão jurídica obrigatória.** `LEGAL-REVIEW` · Versão 0.1 (Fase 0) · LEG-G02
> Controlador: `{{CONTROLADOR}}` · Encarregado: `{{ENCARREGADO}}` · Data: `{{DATA}}`

Revisar este relatório antes do lançamento e sempre que houver nova finalidade, integração (LEG-X04) ou
subprocessador.

## 1. Descrição do tratamento
- Natureza, escopo e contexto: ver `docs/INTENDED_USE.md` e `docs/privacy/ROPA.md`.
- Dados pessoais sensíveis de saúde e bem-estar, informados pela própria pessoa (adultos 18+).
- Fluxo de dados: navegador → servidor (Brasil) → banco (Brasil); IA opcional → provedor `{{LLM}}`.

## 2. Necessidade e proporcionalidade
- Minimização: só os campos necessários a cada módulo; IA recebe agregados (LEG-I02).
- Base legal por operação (ROPA) e consentimento por finalidade, nunca pré-marcado (LEG-C02).
- Transparência: selo de origem em todo dado, Central de Privacidade, lista de subprocessadores.
- Direitos do titular: acesso, correção, portabilidade, eliminação, anonimização, revisão (LEG-D01–D08).

## 3. Riscos identificados
| # | Risco | Probabilidade | Impacto | Risco residual |
|---|---|---|---|---|
| R1 | Acesso indevido a dados de saúde de outro usuário | `{{}}` | Alto | `{{}}` |
| R2 | Vazamento por log, erro ou telemetria | `{{}}` | Alto | `{{}}` |
| R3 | Envio à IA além do consentido ou do mínimo | `{{}}` | Alto | `{{}}` |
| R4 | Transferência internacional sem mecanismo adequado | `{{}}` | Médio | `{{}}` |
| R5 | Uso por menores de idade | `{{}}` | Alto | `{{}}` |
| R6 | Interpretação de conteúdo como orientação clínica | `{{}}` | Alto | `{{}}` |
| R7 | Retenção além do prazo (inclusive backups) | `{{}}` | Médio | `{{}}` |
| R8 | Dependência comprometida (cadeia de suprimentos) | `{{}}` | Alto | `{{}}` |

## 4. Medidas de mitigação
| Risco | Medidas | Requisitos |
|---|---|---|
| R1 | RLS + `app_user` sem BYPASSRLS, `SET LOCAL app.user_id`, testes de isolamento | LEG-S03 |
| R2 | Logger só com metadados, ESLint proíbe `console`, remoção de PII em erros | LEG-R04, LEG-I08 |
| R3 | Consentimento de IA padrão desligado, painel "o que a IA verá", minimização | LEG-I01, I02 |
| R4 | Registro em SUBPROCESSORS, consentimento de transferência, cláusulas contratuais | LEG-S10, LEG-I03 |
| R5 | Age gate 18+ sem persistir dado do menor; linguagem não dirigida a menores | LEG-F01–F04 |
| R6 | Declaração de finalidade, avisos `disclaimer.*`, teste de alegações proibidas, camada de saída da IA | LEG-M01–M05, LEG-I04 |
| R7 | `PURGE_DAYS`, backup ≤ prazo de purga (validado), expurgo de AccessLog | LEG-D04, S07, R02 |
| R8 | Auditoria de dependências, SAST, actions por SHA, builds nativos negados | LEG-S09 |

## 5. Parecer do encarregado
`{{PARECER_ENCARREGADO}}`

## 6. Aprovação
`{{RESPONSAVEL}}` · `{{DATA_APROVACAO}}`
