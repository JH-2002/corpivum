# Índice de Bem-Estar: fórmulas

> Fonte da verdade: `src/modules/wellbeing/score.ts` (`SCORE_V3`), testes em
> `src/modules/wellbeing/score.test.ts`. Requisitos: §14, LEG-D08. `LEGAL-REVIEW` e revisão clínica dos
> textos antes do lançamento (OPEN_ISSUES OI-09).

## O que é e o que não é
Número de 0 a 100 que resume os **registros da própria pessoa** no período selecionado: regularidade do
sono, cumprimento de hábitos, regularidade do registro de atividade física e constância de registro. **Não é avaliação
de saúde**: não usa referência populacional, não classifica, não indica risco nem condição. **Peso e medidas
nunca entram** (LEG-M06). Selo na interface: ESTIMADO (cálculo direto a partir de dados informados).

## Versão 3 (`score_version = 3`, vigente, ADR-0050)

A v2 com o componente atividade ligado. Pesos, limiares e os outros componentes não mudaram.

| Componente | Peso | Entra quando | Cálculo (0–100) |
|---|---|---|---|
| Atividade (`activity`) | 0,20 | ≥ 3 dias com atividade registrada no período | Semanas (segunda a domingo) com pelo menos uma atividade registrada ÷ semanas desde a do primeiro registro do período (sono, check ou atividade) até a do fim dele. Uma atividade na semana já conta a semana inteira. Conta só a data: duração, intensidade, distância, carga e calorias não entram (LEG-M07). |

Por que semanas com registro, e não minutos em relação a uma meta (proposta antiga da OI-28) nem dias ativos: a
meta de atividade é opcional; medir volume premiaria fazer mais; e contar dias faria o valor só chegar a 100 com
atividade todos os dias, o que penalizaria o descanso (revisão de privacidade da 9d0, LEG-M07, LEG-M08). O texto do
componente diz que conta só a regularidade do registro. Na demo, com atividade em todo o período, o Índice deixa de
aparecer como "dados parciais".

## Versão 2 (`score_version = 2`, histórica, ADR-0027)

A v1 sem o componente humor e energia (removido do produto). Os pesos restantes foram renormalizados na mesma
proporção da v1 (0,25 : 0,20 : 0,15 : 0,15) e arredondados para somar 1. Limiares e fórmulas dos componentes
não mudaram.

| Componente | Peso |
|---|---|
| Regularidade do sono (`sleepRegularity`) | 0,33 |
| Hábitos (`habits`) | 0,27 |
| Atividade (`activity`) | 0,20 (sempre fora na v2) |
| Constância de registro (`logging`) | 0,20 |

Na constância de registro, dias só com medição do corpo não contam: pesar mais vezes não sobe o Índice
(LEG-M06). Os índices não são guardados; pedidos de revisão abertos com a v1 continuam com `score_version = 1`.

## Versão 1 (`score_version = 1`, histórica)

| Componente | Peso | Entra quando | Cálculo (0–100) |
|---|---|---|---|
| Regularidade do sono (`sleepRegularity`) | 0,25 | ≥ 3 registros de sono no período | `100 × (1 − variação ÷ 120)`, limitado a 0–100. Variação = média dos desvios-padrão (min) dos horários locais de deitar e de acordar. Deitar é centrado na meia-noite (23:00 = −60). |
| Humor e energia (`moodEnergy`) | 0,25 | ≥ 3 registros de humor | Média de `(humor + energia) ÷ 2` (escala 1–5), levada a 0–100: `(média − 1) ÷ 4 × 100`. |
| Hábitos (`habits`) | 0,20 | ≥ 1 hábito ativo e ≥ 3 ocorrências esperadas | Checks feitos ÷ ocorrências esperadas, limitado a 100%. Esperado: diário = dias desde a criação; dias da semana = dias marcados; X por semana = X × dias ÷ 7. |
| Atividade (`activity`) | 0,15 | Nunca na v1 | O módulo de atividade chega na Fase 4. Sempre fora do cálculo, com motivo "ainda não disponível". |
| Constância de registro (`logging`) | 0,15 | ≥ 1 dia com registro | Dias com algum registro ÷ dias desde o primeiro registro do período até o fim dele. Contar a partir do primeiro registro evita penalizar quem começou no meio do período. |

**Agregação.** Os componentes fora do cálculo saem e os pesos dos incluídos são renormalizados para somar
1. Com menos de 2 componentes incluídos, o Índice fica sem valor ("dados insuficientes"). Com algum
componente fora, o card mostra "dados parciais" e a explicação lista o motivo de cada um.

**Tendência.** O mesmo cálculo no período anterior de mesmo tamanho. A diferença aparece no card.

## Explicação e revisão (LEG-D08)
- O card tem "Como é calculado": componentes, peso nominal e efetivo, valor, quantidade de registros e
  motivo de exclusão. Mesmo texto no demo.
- "Pedir revisão" abre um pedido do titular `automated_review` (`app.privacy_request_score_review`), com a
  versão e o período, **sem valores de saúde**, prazo de 15 dias (art. 19, II) e AuditLog. Um pedido aberto
  por vez (idempotente). `LEGAL-REVIEW`: atendimento do pedido (OPEN_ISSUES).

## Resumo do dashboard (§11.1)
Gerado por regras em `src/modules/wellbeing/summary.ts` (`SUMMARY_RULES`), sem IA. Compara com o período
anterior e descreve a primeira mudança relevante, nesta ordem: sono médio (≥ 20 min, com ≥ 3 registros nos
dois períodos) e cumprimento de hábitos (≥ 10 pontos percentuais). Desde a v2 (ADR-0027) não há humor. Sem mudança
relevante, informa em quantos dias houve registro. Linguagem descritiva, sem causa nem julgamento.

## Como mudar
Qualquer alteração de peso, limiar ou fórmula é uma **versão nova**: novo `SCORE_Vn`, novos testes, nova
seção neste documento e registro em `docs/DECISIONS.md`. Versões antigas não são recalculadas em pedidos
de revisão: o pedido guarda a versão usada.
