'use server';

import { APP_TIME_ZONE, localDay } from '@/lib/dates';
import { sanitizePeriod } from '@/lib/period-schema';
import { writePeriod } from '@/lib/period-server';

/**
 * Grava o período global (§10) no cookie de sessão. Pública de propósito: também vale no demo sem login
 * (LEG-X02), e só guarda uma preferência de interface validada (Zod + checagem do intervalo), sem
 * identificador e sem dado de saúde.
 */
export async function setPeriodAction(raw: string): Promise<void> {
  if (typeof raw !== 'string' || raw.length > 200) return;
  const today = localDay(new Date(), APP_TIME_ZONE);
  await writePeriod(sanitizePeriod(raw, today));
}
