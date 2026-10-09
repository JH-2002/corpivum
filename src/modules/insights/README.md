# Módulo `insights`

Camada explicativa por regras (sem IA): resumo em texto de 2 a 4 frases e destaques do período.

- Spec: §11.1, §13, §20, §22, §23 · Requisitos: LEG-M01, LEG-M03, LEG-M04, LEG-M06, LEG-F05, LEG-X01, LEG-X02
- Decisão: ADR-0025 (humor e diário saíram na reorientação, ADR-0027)

## Regras de redação
- Compara a pessoa só com o próprio histórico (período anterior de mesmo tamanho) e com a frequência
  prevista dos hábitos. Nunca com "normal", média populacional ou faixa clínica.
- Descreve e associa; nunca atribui causa.
- Corpo: sem juízo, sem IMC no twin, o peso aparece só como número (LEG-M06).
- Argumentos nunca carregam conteúdo livre (notas, nomes de hábitos).

## Pontos de entrada
- `index.ts`: `sleepInsights`, `habitsInsights`, `bodyInsights`, `twinBodyInsights`, `dashboardInsights` e
  `INSIGHT_RULES`. O texto vem de `messages/pt-BR.json` (`insights.*`) e é montado por
  `src/components/insights/text.ts`.
