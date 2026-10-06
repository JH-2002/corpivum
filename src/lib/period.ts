import { z } from 'zod';

/** Seletor de período global (§10). Datas como `YYYY-MM-DD` no fuso local, sem horário. */
export const PERIOD_PRESETS = ['7d', '30d', '90d', '12m'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

const isoDate = z.iso.date();

export const periodSchema = z.discriminatedUnion('preset', [
  z.object({ preset: z.enum(PERIOD_PRESETS) }),
  z.object({ preset: z.literal('custom'), from: isoDate, to: isoDate }),
]);
export type Period = z.infer<typeof periodSchema>;

export const DEFAULT_PERIOD: Period = { preset: '30d' };

export interface DateRange {
  from: string;
  to: string;
}

export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fromIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

/** Intervalo inclusivo terminando em `today`. "7 dias" = hoje e os 6 dias anteriores. */
export function resolveRange(period: Period, today: string): DateRange {
  if (period.preset === 'custom') return { from: period.from, to: period.to };

  const start = fromIsoDate(today);
  if (period.preset === '12m') {
    start.setFullYear(start.getFullYear() - 1);
    start.setDate(start.getDate() + 1);
  } else {
    const days = { '7d': 7, '30d': 30, '90d': 90 }[period.preset];
    start.setDate(start.getDate() - (days - 1));
  }
  return { from: toIsoDate(start), to: today };
}

export type CustomRangeError = 'invalid' | 'inverted' | 'future';

/** Valida um intervalo personalizado: datas válidas, início <= fim, nenhuma no futuro. */
export function validateCustomRange(
  from: string,
  to: string,
  today: string,
): CustomRangeError | null {
  if (!isoDate.safeParse(from).success || !isoDate.safeParse(to).success) return 'invalid';
  if (from > to) return 'inverted';
  if (to > today) return 'future';
  return null;
}

/** Lê um período salvo (ex.: sessionStorage), descartando qualquer valor inválido. */
export function parseStoredPeriod(raw: string | null): Period {
  if (!raw) return DEFAULT_PERIOD;
  try {
    const parsed = periodSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return DEFAULT_PERIOD;
    if (parsed.data.preset === 'custom' && parsed.data.from > parsed.data.to) return DEFAULT_PERIOD;
    return parsed.data;
  } catch {
    return DEFAULT_PERIOD;
  }
}

export function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
