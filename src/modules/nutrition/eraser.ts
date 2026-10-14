import type { Tx } from '@/lib/db';

/**
 * Eliminação dos dados de alimentação após a revogação (ADR-0019/0021, LEG-D04). `DELETE` SEM `WHERE`: com
 * WHERE, o Postgres aplicaria também a política de SELECT, que exige consentimento, e nada seria apagado.
 */
export async function eraseNutritionData(tx: Tx): Promise<number> {
  const meals = await tx.$executeRaw`DELETE FROM public.meal_entries`;
  const water = await tx.$executeRaw`DELETE FROM public.water_entries`;
  return meals + water;
}
