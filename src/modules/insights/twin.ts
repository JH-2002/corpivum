import type { DateRange } from '@/lib/period';
import type { BodyRecord } from '@/modules/body';
import { bodyShape, bodySnapshotAt, measurementDays } from '@/modules/twin';
import { cap, days, int, periodArgs, sentence } from './rules';
import type { ModuleInsights } from './types';

export interface TwinBodyInsightsInput {
  /** Medições do período, em ordem crescente de data. */
  records: BodyRecord[];
  /** Última altura informada em qualquer data (usada se o período não tiver altura). */
  latestHeightCm: number | null;
  range: DateRange;
  today: string;
}

/** Altura + 5 circunferências: as medidas que dão forma ao modelo. */
const SHAPE_MEASURES = 6;

/**
 * Resumo do corpo 3D (§15, ADR-0025/0026): quantas medidas informadas dão forma ao modelo, o que fica
 * na forma neutra, o alcance do controle de datas e que o peso não muda a forma. Sem IMC, sem
 * classificação e sem juízo sobre o corpo (LEG-M04).
 */
export function twinBodyInsights({
  records,
  latestHeightCm,
  range,
  today,
}: TwinBodyInsightsInput): ModuleInsights {
  const period = periodArgs(range, today);
  const base = { module: 'twin' as const, highlights: [], supportSignal: false };
  if (records.length === 0) return { ...base, state: 'empty', sentences: [sentence('empty')] };

  const dates = measurementDays(records);
  const last = dates[dates.length - 1] ?? today;
  const shape = bodyShape(bodySnapshotAt(records, last, latestHeightCm));
  const informed = SHAPE_MEASURES - shape.missing.length - (shape.heightMissing ? 1 : 0);
  const shapeFrom = sentence('shapeFrom', {
    ...period,
    count: int(informed),
    total: int(SHAPE_MEASURES),
  });
  const neutral =
    shape.missing.length > 0 || shape.heightMissing
      ? sentence('neutral', { count: int(SHAPE_MEASURES - informed) })
      : null;
  const weightNote = records.some((r) => r.weightKg !== null) ? sentence('weightNote') : null;

  if (dates.length < 2) {
    return { ...base, state: 'partial', sentences: cap([shapeFrom, sentence('partial'), neutral]) };
  }
  return {
    ...base,
    state: 'ok',
    sentences: cap([
      shapeFrom,
      sentence('dates', {
        count: int(dates.length),
        first: days([dates[0] ?? last], range),
        last: days([last], range),
      }),
      neutral,
      weightNote,
    ]),
  };
}
