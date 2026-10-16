import 'server-only';
import { z } from 'zod';
import { DEFAULT_PERIOD, PERIOD_PRESETS, validateCustomRange, type Period } from './period';

/** Validação com Zod do período que chega do navegador (cookie, server action). Só no servidor (§41, 7d). */
const isoDate = z.iso.date();

export const periodSchema: z.ZodType<Period> = z.discriminatedUnion('preset', [
  z.object({ preset: z.enum(PERIOD_PRESETS) }),
  z.object({ preset: z.literal('custom'), from: isoDate, to: isoDate }),
]);

/**
 * Período vindo do navegador (cookie), revalidado contra `today`: qualquer valor inválido, invertido,
 * futuro ou longo demais vira o padrão.
 */
export function sanitizePeriod(raw: string | null | undefined, today: string): Period {
  const period = parseStoredPeriod(raw ?? null);
  if (period.preset === 'custom' && validateCustomRange(period.from, period.to, today)) {
    return DEFAULT_PERIOD;
  }
  return period;
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
