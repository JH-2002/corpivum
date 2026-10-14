import type { DateRange } from '@/lib/period';
import {
  averagePerception,
  averageWaterMl,
  daysWithMeals,
  type MealRecord,
  type WaterRecord,
} from '@/modules/nutrition';
import { cap, decimal, INSIGHT_RULES, int, periodArgs, sentence } from './rules';
import type { Highlight, InsightSentence, ModuleInsights } from './types';

export interface NutritionInsightsInput {
  meals: MealRecord[];
  water: WaterRecord[];
  /** Refeições do período anterior de mesmo tamanho (só para comparar a constância do registro). */
  previousMeals: MealRecord[];
  range: DateRange;
  today: string;
}

/**
 * Resumo de alimentação (§25, LEG-M07, LEG-M08). Descreve só a constância do registro, a água e as
 * percepções informadas. Nunca fala de calorias, nunca rotula comida e nunca sugere o que comer.
 */
export function nutritionInsights({
  meals,
  water,
  previousMeals,
  range,
  today,
}: NutritionInsightsInput): ModuleInsights {
  const period = periodArgs(range, today);
  const base = { module: 'nutrition' as const, highlights: [] };
  if (meals.length === 0 && water.length === 0) {
    return { ...base, state: 'empty', sentences: [sentence('empty')] };
  }
  const mealDays = daysWithMeals(meals, range);
  const logged = sentence('logged', {
    ...period,
    meals: int(meals.length),
    mealDays: int(mealDays),
  });
  const avgWater = averageWaterMl(water);
  const waterSentence = avgWater === null ? null : sentence('water', { ml: int(avgWater) });
  if (mealDays < INSIGHT_RULES.minRecords) {
    return {
      ...base,
      state: 'partial',
      sentences: cap([logged, waterSentence, sentence('partial')]),
    };
  }

  let compare: InsightSentence | null = null;
  const previousDays = new Set(previousMeals.map((m) => m.day)).size;
  if (previousDays >= INSIGHT_RULES.minRecords) {
    const diff = mealDays - previousDays;
    const args = { diff: int(Math.abs(diff)), days: period.days };
    compare =
      diff === 0
        ? sentence('compareSame', args)
        : sentence(diff > 0 ? 'compareMore' : 'compareLess', args);
  }
  const satisfaction = averagePerception(meals, 'satisfaction');

  const highlights: Highlight[] = [{ key: 'mealDays', value: int(mealDays), level: 'INFORMADO' }];
  if (avgWater !== null) highlights.push({ key: 'water', value: int(avgWater), level: 'ESTIMADO' });
  if (satisfaction !== null) {
    highlights.push({ key: 'satisfaction', value: decimal(satisfaction), level: 'ESTIMADO' });
  }

  return {
    ...base,
    state: 'ok',
    highlights,
    sentences: cap([
      logged,
      compare,
      waterSentence,
      satisfaction === null ? null : sentence('satisfaction', { value: decimal(satisfaction) }),
    ]),
  };
}
