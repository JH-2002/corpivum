import type { Tx } from '@/lib/db';

/**
 * Eliminação após a revogação (ADR-0021). Checks antes dos hábitos (a cascata também os levaria, mas a
 * contagem fica explícita). `DELETE` sem `WHERE`: ver `src/modules/sleep/eraser.ts`.
 */
export async function eraseHabitsData(tx: Tx): Promise<number> {
  const checks = await tx.$executeRaw`DELETE FROM public.habit_checks`;
  const habits = await tx.$executeRaw`DELETE FROM public.habits`;
  return checks + habits;
}
