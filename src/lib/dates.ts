import type { DateRange } from './period';

/**
 * Datas do dia a dia no fuso da pessoa (pt-BR, `src/i18n/request.ts`). Registros guardam instantes em UTC
 * (timestamptz); o "dia" de um registro é a data local nesse fuso. Funções puras: recebem o fuso.
 */
export const APP_TIME_ZONE = 'America/Sao_Paulo';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsFormatters.set(timeZone, f);
  }
  return f;
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function localParts(instant: Date, timeZone: string): LocalParts {
  const out: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(instant)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    year: out.year ?? 0,
    month: out.month ?? 0,
    day: out.day ?? 0,
    hour: out.hour ?? 0,
    minute: out.minute ?? 0,
    second: out.second ?? 0,
  };
}

/** Diferença (ms) entre o horário local no fuso e o UTC, no instante dado. */
function offsetMs(instant: Date, timeZone: string): number {
  const p = localParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Data local (`YYYY-MM-DD`) de um instante no fuso. */
export function localDay(instant: Date, timeZone: string = APP_TIME_ZONE): string {
  const p = localParts(instant, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Horário local `HH:MM` de um instante no fuso. */
export function localTime(instant: Date, timeZone: string = APP_TIME_ZONE): string {
  const p = localParts(instant, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Valor para `<input type="datetime-local">` (`YYYY-MM-DDTHH:MM`) no fuso. */
export function toLocalDateTime(instant: Date, timeZone: string = APP_TIME_ZONE): string {
  return `${localDay(instant, timeZone)}T${localTime(instant, timeZone)}`;
}

/** Converte `YYYY-MM-DDTHH:MM` (horário local no fuso) para o instante UTC. */
export function fromLocalDateTime(value: string, timeZone: string = APP_TIME_ZONE): Date {
  const m = LOCAL_DATE_TIME.exec(value);
  if (!m) throw new RangeError('local date-time inválido');
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // Duas passadas resolvem a virada de horário de verão, se o fuso tiver.
  let instant = guess - offsetMs(new Date(guess), timeZone);
  instant = guess - offsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

/** Início (00:00 local) do dia `YYYY-MM-DD` no fuso, como instante UTC. */
export function dayStart(iso: string, timeZone: string = APP_TIME_ZONE): Date {
  if (!ISO_DATE.test(iso)) throw new RangeError('data inválida');
  return fromLocalDateTime(`${iso}T00:00`, timeZone);
}

/** Soma dias a uma data `YYYY-MM-DD` (calendário, sem fuso). */
export function addDays(iso: string, days: number): string {
  const m = ISO_DATE.exec(iso);
  if (!m) throw new RangeError('data inválida');
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return date.toISOString().slice(0, 10);
}

/** Dias corridos de `from` até `to` (0 quando iguais). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Todos os dias do intervalo inclusivo. */
export function eachDay(range: DateRange): string[] {
  const out: string[] = [];
  const n = daysBetween(range.from, range.to);
  for (let i = 0; i <= n; i += 1) out.push(addDays(range.from, i));
  return out;
}

/** Quantidade de dias do intervalo inclusivo. */
export function rangeLength(range: DateRange): number {
  return daysBetween(range.from, range.to) + 1;
}

/** Período imediatamente anterior, de mesmo tamanho (variação no período, §12). */
export function previousRange(range: DateRange): DateRange {
  const len = rangeLength(range);
  return { from: addDays(range.from, -len), to: addDays(range.from, -1) };
}

/** Limites UTC [início, fim) do intervalo inclusivo de dias no fuso. */
export function rangeBounds(
  range: DateRange,
  timeZone: string = APP_TIME_ZONE,
): { gte: Date; lt: Date } {
  return { gte: dayStart(range.from, timeZone), lt: dayStart(addDays(range.to, 1), timeZone) };
}

/** Dia da semana: 0 = domingo … 6 = sábado. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Segunda a domingo, ordem de exibição em pt-BR. */
export const WEEK_ORDER: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 0];

/** Dia da semana (0 = domingo) de uma data `YYYY-MM-DD`. */
export function weekday(iso: string): Weekday {
  return new Date(`${iso}T12:00:00Z`).getUTCDay() as Weekday;
}

/** Converte `YYYY-MM-DD` em Date à meia-noite UTC (colunas `date` do Prisma). */
export function isoToDbDate(iso: string): Date {
  if (!ISO_DATE.test(iso)) throw new RangeError('data inválida');
  return new Date(`${iso}T00:00:00Z`);
}

/** Inverso de `isoToDbDate`. */
export function dbDateToIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Segunda-feira (início da semana em pt-BR) da semana de `iso`. */
export function weekStart(iso: string): string {
  const wd = weekday(iso);
  return addDays(iso, wd === 0 ? -6 : 1 - wd);
}

/** Semana corrente até `today` (segunda-feira → hoje). */
export function weekToDate(today: string): DateRange {
  return { from: weekStart(today), to: today };
}

export interface WeekGroup<T> {
  /** Segunda-feira da semana. */
  start: string;
  /** Domingo da semana. */
  end: string;
  items: T[];
}

/**
 * Agrupa itens por semana (segunda a domingo), da semana mais recente para a mais antiga, mantendo a ordem dos
 * itens dentro de cada semana. Só apresentação: nenhum item entra ou sai.
 */
export function groupByWeek<T>(items: readonly T[], dayOf: (item: T) => string): WeekGroup<T>[] {
  const weeks = new Map<string, T[]>();
  for (const item of items) {
    const start = weekStart(dayOf(item));
    const list = weeks.get(start);
    if (list) list.push(item);
    else weeks.set(start, [item]);
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([start, list]) => ({ start, end: addDays(start, 6), items: list }));
}
