import { formatDecimal, formatDuration } from '@/components/health/format';
import type { GoalMetric } from '@/modules/goals';

/**
 * Valor de uma meta com unidade ("7 h 30 min", "3 sessões", "80%"). `unitOf` traduz `goals.units.<métrica>`.
 * Mesmo texto na tela de metas e nos marcos da timeline.
 */
export function formatGoalValue(
  metric: GoalMetric,
  value: number,
  unitOf: (metric: GoalMetric) => string,
): string {
  if (metric === 'sleep_avg_minutes' || metric === 'activity_minutes_week') {
    return formatDuration(value);
  }
  const unit = unitOf(metric);
  return unit === '%' ? `${formatDecimal(value)}%` : `${formatDecimal(value)} ${unit}`;
}
