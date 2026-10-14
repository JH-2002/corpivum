/**
 * Metas (§30). Cada meta é de um domínio e mede uma métrica fechada: sem texto livre (nada a cifrar) e sem
 * métrica que julgue o corpo. Metas de peso e de calorias passam pelos guardrails (LEG-M04, LEG-M07).
 */
export const GOAL_DOMAINS = [
  'sleep',
  'activity',
  'habits',
  'weight',
  'logging',
  'nutrition',
] as const;
export type GoalDomain = (typeof GOAL_DOMAINS)[number];

export const GOAL_METRICS = [
  'sleep_avg_minutes',
  'activity_minutes_week',
  'activity_sessions_week',
  'habit_completion_pct',
  'weight_kg',
  'logging_days_week',
  'kcal_reference_day',
] as const;
export type GoalMetric = (typeof GOAL_METRICS)[number];

/** Domínio de cada métrica. */
export const METRIC_DOMAIN: Readonly<Record<GoalMetric, GoalDomain>> = Object.freeze({
  sleep_avg_minutes: 'sleep',
  activity_minutes_week: 'activity',
  activity_sessions_week: 'activity',
  habit_completion_pct: 'habits',
  weight_kg: 'weight',
  logging_days_week: 'logging',
  kcal_reference_day: 'nutrition',
});

/**
 * Faixa aceita pelo formulário em cada métrica (validação comum). Peso e calorias ainda passam pelos
 * guardrails: a faixa aqui só recusa valor sem sentido, não decide o que é seguro.
 */
export const METRIC_RANGE: Readonly<
  Record<GoalMetric, { min: number; max: number; step: number }>
> = Object.freeze({
  sleep_avg_minutes: { min: 240, max: 720, step: 15 },
  activity_minutes_week: { min: 10, max: 3000, step: 5 },
  activity_sessions_week: { min: 1, max: 21, step: 1 },
  habit_completion_pct: { min: 10, max: 100, step: 5 },
  weight_kg: { min: 20, max: 400, step: 0.1 },
  logging_days_week: { min: 1, max: 7, step: 1 },
  kcal_reference_day: { min: 1, max: 10000, step: 50 },
});

export const GOAL_STATUSES = ['active', 'achieved', 'closed', 'archived'] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

/** Meta como a interface recebe. Mesma forma para dados reais e de demo. */
export interface GoalRecord {
  id: string;
  domain: GoalDomain;
  metric: GoalMetric;
  targetValue: number;
  /** Peso no momento da criação (metas de peso): base da barra de progresso. */
  startValue: number | null;
  habitId: string | null;
  /** Prazo opcional (`YYYY-MM-DD`); obrigatório em meta de perda de peso. */
  targetDay: string | null;
  status: GoalStatus;
  createdDay: string;
  /** Dia em que a meta foi marcada como alcançada (marco na timeline, exceto peso). */
  achievedDay: string | null;
}
