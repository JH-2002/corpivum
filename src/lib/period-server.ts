import 'server-only';
import { cookies } from 'next/headers';
import { APP_TIME_ZONE, localDay } from './dates';
import { resolveRange, sanitizePeriod, type DateRange, type Period } from './period';

/**
 * Período global no servidor (§10, ADR-0021). Cookie de sessão (sem `maxAge`: some ao fechar o
 * navegador), HttpOnly, sem identificador: só a preferência de interface. Os Server Components leem o
 * período e agregam os dados no servidor (§41). Substitui o `sessionStorage` da ADR-0006.
 */
export const PERIOD_COOKIE = '__Host-hm_period';

export interface PeriodContext {
  today: string;
  period: Period;
  range: DateRange;
}

export async function readPeriod(now: Date = new Date()): Promise<PeriodContext> {
  const today = localDay(now, APP_TIME_ZONE);
  const period = sanitizePeriod((await cookies()).get(PERIOD_COOKIE)?.value, today);
  return { today, period, range: resolveRange(period, today) };
}

export async function writePeriod(period: Period): Promise<void> {
  (await cookies()).set(PERIOD_COOKIE, JSON.stringify(period), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
  });
}
