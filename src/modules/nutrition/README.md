# Módulo `nutrition`

Refeições e água, sem juízo e sem restrição (ADR-0029).

- Spec: §25 · Requisitos: LEG-M07, LEG-M08, LEG-S02, LEG-S03
- `index.ts`: tipos, schemas e métricas puras (dias com registro, água, percepções, total calórico do dia).
- `service.ts`: refeições e água com consentimento + RLS; descrição e nota cifradas; caloria só com a estimativa
  ligada (`checkCalorieEstimate`); desligar oculta sem apagar.
- Regras: categorias só descrevem o momento do dia; nada rotula comida, sugere cardápio ou fala de "restante".
