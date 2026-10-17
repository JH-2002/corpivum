# Relatório de Impacto à Proteção de Dados (RIPD) — LGPD art. 38

> **RASCUNHO — revisão jurídica obrigatória.** `LEGAL-REVIEW` · Versão 0.7 (governança da Fase 7, ADR-0041) · LEG-G02
> Controlador: `{{CONTROLADOR}}` · Encarregado: `{{ENCARREGADO}}` · Data: `{{DATA_RIPD}}`

Revisar este relatório antes do lançamento e sempre que houver nova finalidade, integração (LEG-X04) ou
subprocessador. A probabilidade e o risco residual da seção 3 são **propostas da equipe técnica**, feitas sobre o
código e os testes da Fase 7; o encarregado valida ou ajusta no parecer (seção 5).

## 1. Descrição do tratamento
- Natureza, escopo e contexto: `docs/INTENDED_USE.md` e `docs/privacy/ROPA.md` (operações T1 a T14).
- Dados pessoais sensíveis de bem-estar (peso e medidas, sono, hábitos, alimentação, atividade física, metas e
  lembretes), informados pela própria pessoa (adultos 18+). Sem nome, documento, foto nem localização.
- Fluxo de dados: navegador → servidor (Brasil) → banco (Brasil); worker dedicado dos jobs no Brasil; arquivos de
  exportação cifrados em storage no Brasil. Nenhum dado vai a provedor de IA (ADR-0030). Fora do Brasil,
  provavelmente, só e-mail transacional e monitoramento de erros, sem conteúdo de saúde (o envio de um lembrete
  pode indicar rotina, ROPA T7; OI-03). Regiões declaradas em `infra/regions.json` e conferidas na CI.
- Prazos: `docs/privacy/RETENTION.md`. Provedores: `docs/privacy/SUBPROCESSORS.md`.

## 2. Necessidade e proporcionalidade
- Minimização: só os campos necessários a cada módulo; resumos calculados por regras no próprio servidor; IMC e
  relação cintura/quadril só internos; nada calculado é armazenado (Índice, twin, progresso).
- Base legal por operação (ROPA) e consentimento por finalidade, nunca pré-marcado (LEG-C02).
- Transparência: selo de origem em todo dado, Central de Privacidade, Política v2 com as categorias de dados e os
  prazos, lista pública de subprocessadores.
- Direitos do titular: acesso, correção, portabilidade, eliminação, anonimização (respondida com a exclusão,
  OI-31), revisão do Índice (LEG-D01–D08), inclusive durante o onboarding e por pedido fora do app.

## 3. Riscos identificados
Escala: probabilidade Baixa / Média / Alta antes das medidas; risco residual depois delas.

| # | Risco | Probabilidade | Impacto | Risco residual (proposta) |
|---|---|---|---|---|
| R1 | Acesso indevido a dados de saúde de outro usuário (erro de aplicação) | Média | Alto | Baixo |
| R2 | Vazamento por log, erro ou telemetria | Média | Alto | Baixo |
| R3 | ~~Envio à IA além do consentido ou do mínimo~~ **Encerrado (ADR-0030):** não há IA | — | — | — |
| R4 | Transferência internacional (e-mail transacional, monitoramento de erros) sem mecanismo adequado | Alta (até o OI-03) | Médio | Médio até definir o art. 33; Baixo depois |
| R5 | Uso por menores de idade | Média | Alto | Médio (autodeclaração; OI-02) |
| R6 | Interpretação de conteúdo como orientação clínica | Média | Alto | Baixo, pendente revisão clínica (OI-09, OI-23) |
| R7 | Retenção além do prazo (inclusive backups) | Média | Médio | Baixo |
| R8 | Dependência comprometida (cadeia de suprimentos) | Média | Alto | Médio (ver R17) |
| R9 | Tratamento sem consentimento válido (pré-marcação, versão desatualizada, revogação ignorada) | Baixa | Alto | Baixo |
| R10 | Perda das provas de consentimento e de pedidos ao excluir contas | Baixa | Médio | Baixo |
| R11 | Dado fictício confundido com real (ou misturado aos dados da pessoa) | Baixa | Médio | Baixo |
| R12 | Índice de Bem-Estar lido como avaliação de saúde | Média | Alto | Baixo, pendente OI-18 |
| R13 | Dado de saúde mantido após revogação além do prazo (eliminação incompleta) | Baixa | Alto | Baixo |
| R14 | Corpo 3D lido como avaliação corporal | Média | Alto | Médio até a revisão clínica (OI-22, OI-24) |
| R15 | Dano à imagem corporal ou incentivo a padrão alimentar restritivo (metas, alimentação, textos) | Média | Alto | Médio até a revisão clínica dos limiares (OI-23) |
| R16 | Restauração de backup desfaz direitos atendidos (exclusões, revogações) ou volta senha antiga | Baixa | Alto | Baixo com livro; Médio sem livro (7e-R1, 7e-R2) |
| R17 | Código que executa como o runtime (invasão do servidor, dependência maliciosa) lê dados de qualquer conta, já que o contexto do RLS é declarado pelo próprio runtime (P7-M1) | Baixa | Alto | Médio (residual aceito, ver seção 4) |
| R18 | Conta sem uso mantida sem prazo (cadastro confirmado sem onboarding) | Média | Baixo | Baixo (prazo de 30 dias, ADR-0037) |
| R19 | Abuso do atendimento manual (consulta de e-mails pelo encarregado) | Baixa | Médio | Baixo; duplo controle em aberto (OI-34, 7c-R2) |

## 4. Medidas de mitigação
| Risco | Medidas | Requisitos |
|---|---|---|
| R1 | RLS + `app_user` sem BYPASSRLS, `SET LOCAL app.user_id`, testes de isolamento; jobs só no `app_worker` (ADR-0037) | LEG-S03 |
| R2 | Logger só com metadados; teste estático recusa `console` e `process.stdout`/`stderr` fora do logger; guarda do console em produção cobre todos os métodos; relatório de erro por lista de campos permitidos, sem mensagem, com teste de injeção (ADR-0038, ADR-0039, ADR-0040). Residuais: escrita direta de dependência em `stdout` (7e-N1) e nome de erro em formato aberto (7d-N4: um nome como `PESO_82KG` passaria; lista fechada de nomes junto com o fornecedor de erros, CHECKLIST) | LEG-R04 |
| R3 | Encerrado: sem IA nem provedor de LLM; finalidades de IA e transferência bloqueadas por CHECK no banco | ADR-0030 |
| R4 | Registro em SUBPROCESSORS antes de ativar, conferido na CI (`check:infra`); nenhum conteúdo de saúde nos serviços fora do Brasil (o lembrete por e-mail pode indicar rotina, ROPA T7); mecanismo do art. 33 sem consentimento do titular (ex.: cláusulas contratuais padrão), a definir no jurídico (OI-03) | LEG-S10, LEG-R04 |
| R5 | Age gate 18+ sem persistir dado do menor; encerramento de menor pela Central ou durante o onboarding, com teto que nunca bloqueia quem se declarou menor (ADR-0037 D4); linguagem não dirigida a menores | LEG-F01–F04 |
| R6 | Declaração de finalidade, avisos `disclaimer.*`, teste de alegações proibidas, resumos por regras fixas (sem IA nem recomendações automáticas); sem prescrição de dieta ou treino | LEG-M01, LEG-M03, LEG-M08, ADR-0030 |
| R7 | `PURGE_DAYS`, backup ≤ prazo de purga (validado no ambiente, no início dos jobs e na CI, com a política de backup declarada em `infra/retention.json`), expurgo de AccessLog, de provas, das provas de reautenticação e dos jobs da pessoa na purga; contas sem onboarding com prazo; prazos e pior caso (até 60 dias em backup depois de revogar) em `docs/privacy/RETENTION.md` | LEG-D04, S07, R02, ADR-0035, ADR-0037 |
| R8 | Auditoria de dependências, SAST, actions por SHA, imagens por digest, builds nativos negados, CODEOWNERS nas áreas sensíveis | LEG-S09 |
| R9 | Consentimento por finalidade nunca pré-marcado (teste), texto versionado com hash, `app.has_active_consent` no guard e no RLS, revogação vale na próxima operação (teste), reconsentimento em versão substancial; versão não substancial com aviso e ciência registrada (ADR-0031, ADR-0041) | LEG-C01–C06, ADR-0019 |
| R10 | Provas sem FK para `users`, gatilhos contra alteração, teste da lista de FKs e do expurgo com provas presentes; provas copiadas com as datas originais depois de restaurar (ADR-0040) | LEG-R03, PR1a-R3-B8 |
| R11 | Demo gerado em memória, nunca gravado nas tabelas de saúde; selo DEMO em todo dado; indicador no cabeçalho e faixa no modo demo; demo público sem sessão nem escrita (teste e2e) | LEG-X02, ADR-0021 |
| R12 | Texto fixo "não é avaliação de saúde" (`disclaimer.wellbeingScore`), explicação dos critérios, sem classificação nem referência populacional, pedido de revisão | LEG-D08, LEG-M03, ADR-0021 |
| R13 | Toda tabela de saúde com eliminador registrado; teste pelo catálogo do banco que falha se alguma tabela não for zerada; DELETE só por dono, sem depender do consentimento; varredura diária reagenda eliminações perdidas; restauração reaplica as eliminações (`pnpm backup:reapply`, testado na CI) | LEG-D04, PR1b-B9, ADR-0021, ADR-0040 |
| R14 | Corpo só pelas medidas informadas (o peso não muda a forma), sem IMC no twin, cor neutra, diferenças em número, `disclaimer.bodyModel` sempre visível; nada persistido; testes de glossário e de ausência de IMC. O cérebro 3D saiu do produto (ADR-0027) | LEG-M04, LEG-M06, LEG-M03, ADR-0026 |
| R15 | Guardrails em módulo puro testado (`src/modules/guardrails`: IMC mínimo da meta, ritmo máximo de perda, piso calórico), aviso sem números restritivos com orientação profissional e apoio CVV 188 / SAMU 192, acesso permanente "Precisa de ajuda?", glossário de imagem corporal e alimentação; `checkGoal` no servidor com dados do banco e piso calórico também no banco; estimativa calórica desligada por padrão; metas de peso sem barra, sequência, comemoração ou marco; modo privacidade que omite peso, medidas e calorias do HTML em todas as telas (ADR-0035). Pendente: limiares em revisão clínica (OI-23) | LEG-M04, LEG-M06, LEG-M07, LEG-M08, ADR-0027, ADR-0030 |
| R16 | `pnpm backup:restore`/`backup:reapply`: restauração isolada, reaplicação obrigatória a partir da origem ou do livro de hora em hora (storage só de acréscimo no Brasil), identidade da instalação, plano com `--dry-run` e trava depois de liberar o acesso; sessões e tokens zerados. **Residuais aceitos:** sem origem nem livro, perde-se o intervalo até o incidente (7e-R1, registrado como incidente); senha e 2º fator trocados e registros apagados ou corrigidos depois do ponto voltam (7e-R2): o runbook manda orientar a redefinição e avisar as pessoas ativas no intervalo. Correção futura: AuditLog com o id do registro apagado ou corrigido e reaplicação desses ids | LEG-S07, LEG-D02, LEG-D04 |
| R17 | Mitigado sem amarrar o contexto à sessão (custo alto, ganho parcial, ADR-0037): jobs, varreduras e purga só no `app_worker`, separado por inteiro só com o worker dedicado (CHECKLIST); operador por pessoa; `deleted_at` e purga amarrados ao pedido; alerta de volume anômalo de leitura de hora em hora sobre os contadores do Postgres (ADR-0038). **Residuais aceitos:** leitura lenta ou de poucas contas fica abaixo do teto (7c-R1); enquanto a credencial do worker estiver na web, quem executa como o runtime lê a amostra; o KMS do runtime decifra os campos. Dependem do CHECKLIST: worker dedicado, log do banco (pgaudit) num canal externo e calibração dos tetos com o beta | LEG-S02, LEG-S03, LEG-S06 |
| R18 | Aviso no 23º dia e exclusão 30 dias após o cadastro e 7 após o aviso, escritos na Política v2; saída a qualquer momento no onboarding (ADR-0037, ADR-0041) | LEG-R01, LEG-D04 |
| R19 | Um papel por pessoa, `operator_role` no AuditLog, teto de 30 leituras do contato por hora, consulta sem pedido gravada no AuditLog e no log do banco, alerta acima de 20 ações por hora (ADR-0037, ADR-0038). Em aberto: duplo controle nas exclusões pedidas fora do app (CHECKLIST, OI-34) | LEG-S06, LEG-D07 |

## 5. Parecer do encarregado
`{{PARECER_ENCARREGADO}}`

## 6. Aprovação
`{{RESPONSAVEL_APROVACAO}}` · `{{DATA_APROVACAO}}`
