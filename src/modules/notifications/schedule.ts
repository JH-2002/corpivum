import { addDays, fromLocalDateTime, localDay, weekday } from '@/lib/dates';
import type { ReminderRecord } from './types';

/**
 * Agenda dos lembretes, funções puras (§33). Horários no fuso da pessoa; o instante é calculado em UTC.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** `HH:MM` → minuto do dia. */
export function parseTime(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

/** Minuto do dia → `HH:MM`. */
export function formatTime(min: number): string {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

/** Próxima ocorrência estritamente depois de `after`. */
export function nextOccurrence(
  reminder: Pick<ReminderRecord, 'timeMin' | 'weekdays'>,
  after: Date,
  timeZone: string,
): Date {
  const start = localDay(after, timeZone);
  for (let i = 0; i <= 8; i += 1) {
    const day = addDays(start, i);
    if (reminder.weekdays.length > 0 && !reminder.weekdays.includes(weekday(day))) continue;
    const at = fromLocalDateTime(`${day}T${formatTime(reminder.timeMin)}`, timeZone);
    if (at.getTime() > after.getTime()) return at;
  }
  // Inalcançável com dias da semana válidos; mantém a função total.
  throw new RangeError('lembrete sem dia válido');
}

/** O minuto cai no horário silencioso? Aceita janela que vira a meia-noite (ex.: 22:00 → 07:00). */
export function inQuietHours(timeMin: number, start: number | null, end: number | null): boolean {
  if (start === null || end === null || start === end) return false;
  return start < end ? timeMin >= start && timeMin < end : timeMin >= start || timeMin < end;
}

/** Próximos lembretes ativos, em ordem (dashboard "Próximos lembretes"). */
export function upcoming(
  reminders: ReminderRecord[],
  now: Date,
  timeZone: string,
  limit = 3,
): Array<{ reminder: ReminderRecord; at: Date }> {
  return reminders
    .filter((r) => r.enabled)
    .map((reminder) => ({ reminder, at: nextOccurrence(reminder, now, timeZone) }))
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, limit);
}
