# Módulo `insights`

Camada explicativa por regras (sem IA): resumo em texto de 2 a 4 frases, destaques do período e sinal
para mostrar a orientação de apoio junto do resumo de humor.

- Spec: §11.1, §13, §19–§23, §48, §54 · Requisitos: LEG-M01, LEG-M03, LEG-M04, LEG-F05, LEG-X01, LEG-X02
- Decisão: ADR-0025

## Regras de redação
- Compara a pessoa só com o próprio histórico (período anterior de mesmo tamanho) e com a frequência
  prevista dos hábitos. Nunca com "normal", média populacional ou faixa clínica.
- Descreve e associa; nunca atribui causa. O resumo de humor não liga o humor a nenhum outro fator.
- Humor baixo ou em queda: texto acolhedor, sem dramatizar, e a interface mostra o `SupportNotice`
  (CVV 188 / SAMU 192) logo abaixo do resumo.
- Argumentos nunca carregam conteúdo livre (texto do diário, notas, nomes de hábitos).

## Pontos de entrada
- `index.ts`: `sleepInsights`, `moodInsights`, `habitsInsights`, `journalInsights`, `bodyInsights`,
  `dashboardInsights` e `INSIGHT_RULES`. O texto vem de `messages/pt-BR.json` (`insights.*`) e é montado
  por `src/components/insights/text.ts`.
