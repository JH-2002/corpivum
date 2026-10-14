/**
 * Categorias de refeição (§25): só descrevem o momento do dia, nunca a qualidade da comida (LEG-M07).
 */
export const MEAL_CATEGORIES = ['breakfast', 'lunch', 'dinner', 'snack', 'other'] as const;
export type MealCategory = (typeof MEAL_CATEGORIES)[number];

/** Percepções da refeição (autorrelato 1–5). Nenhuma delas é "certa" ou "errada". */
export const MEAL_PERCEPTIONS = ['hunger', 'fullness', 'satisfaction'] as const;
export type MealPerception = (typeof MEAL_PERCEPTIONS)[number];

/** Refeição como a interface recebe. Mesma forma para dados reais e de demo. */
export interface MealRecord {
  id: string;
  /** Instante ISO (UTC). */
  eatenAt: string;
  /** Dia local da refeição (`YYYY-MM-DD`). */
  day: string;
  /** Horário local `HH:MM`. */
  time: string;
  category: MealCategory;
  /** Descrição decifrada; `null` sem descrição ou quando o texto não foi pedido. */
  description: string | null;
  hunger: number | null;
  fullness: number | null;
  satisfaction: number | null;
  /** Estimativa da própria pessoa; sempre `null` com a estimativa desligada (LEG-M07). */
  kcalEstimate: number | null;
  note: string | null;
}

/** Água registrada num dia. */
export interface WaterRecord {
  id: string;
  day: string;
  ml: number;
}

/** Quantidades rápidas de água (ml) no formulário. */
export const WATER_QUICK_ML = [200, 300, 500] as const;

/** Até quantos dias para trás a água pode ser registrada (corrigir esquecimentos recentes). */
export const WATER_BACKFILL_DAYS = 7;
