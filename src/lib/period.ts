/** Seletor de período global (§10). Datas como `YYYY-MM-DD` no fuso local, sem horário. */
export const PERIOD_PRESETS = ['7d', '30d', '90d', '12m'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

/**
 * Este módulo vai ao navegador com o seletor de período do cabeçalho e fica sem Zod: o núcleo do Zod 4 custava
 * ~24 KiB gzip em toda tela do app (orçamento da 7d, §41). A validação com Zod do que chega do navegador fica em
 * `period-schema.ts`, só no servidor.
 */
export type Period = { preset: PeriodPreset } | { preset: 'custom'; from: string; to: string };

/** `YYYY-MM-DD` que existe no calendário (mesma regra do `z.iso.date()`). */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

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

export type CustomRangeError = 'invalid' | 'inverted' | 'future' | 'too_long';

/** Maior intervalo personalizado aceito (dias). Mantém a agregação leve (§41). */
export const MAX_CUSTOM_DAYS = 366;

/** Valida um intervalo personalizado: datas válidas, início <= fim, nenhuma no futuro, até 366 dias. */
export function validateCustomRange(
  from: string,
  to: string,
  today: string,
): CustomRangeError | null {
  if (!isIsoDate(from) || !isIsoDate(to)) return 'invalid';
  if (from > to) return 'inverted';
  if (to > today) return 'future';
  const days = Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
  if (days + 1 > MAX_CUSTOM_DAYS) return 'too_long';
  return null;
}

export function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
