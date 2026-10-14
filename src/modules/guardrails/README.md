# Módulo `guardrails`

Regras de imagem corporal e alimentação, requisito central desde a reorientação (ADR-0027).

- Spec: §25, §28, §30, §55 (ver docs/PRODUCT_SPEC.md e docs/SPEC_ADDENDUM.md)
- Requisitos: LEG-M04, LEG-M06, LEG-M07, LEG-M08
- Pendência: limiares em revisão jurídica e clínica (OI-23, `LEGAL-REVIEW`)

## Pontos de entrada
- `index.ts`: funções puras, chamadas no servidor antes de aceitar ou sugerir um alvo.
  - `checkGoal`: porta única das metas (Fase 4). Peso → `checkWeightGoal` (só perda é limitada);
    calorias → `checkCalorieTarget`, e só com a estimativa calórica ligada.
  - `checkCalorieEstimate`: caloria numa refeição só com a estimativa ligada (desligada por padrão,
    `NUTRITION_RULES`).
  - `allowsStreak` (sequência só em hábitos, nunca ligada a peso) e `allowsMilestone` (meta de peso
    alcançada não vira marco na timeline).
  - `checkRecommendationTopic` (recomendações e IA, Fase 5) e `GUARDRAIL_RULES`.
- Interface: `GuardrailNotice` (`src/components/health/GuardrailNotice.tsx`) mostra a orientação para buscar
  profissional de saúde e o apoio (CVV 188 / SAMU 192), sem números restritivos.

Regras: nenhum alvo bloqueado vira sugestão "mais leve"; o peso nunca molda o corpo 3D; nada compara a pessoa
com outras pessoas ou com médias da população; a atividade nunca mostra calorias gastas (sem compensação).
