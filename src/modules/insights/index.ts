/**
 * Módulo `insights` (ADR-0025): camada explicativa por regras, sem IA. Resumos em texto, destaques e
 * sinal de apoio para o dashboard e os módulos. Funções puras que devolvem chaves do i18n
 * (`insights.*`) e argumentos; o texto é montado em `src/components/insights`.
 */
export { activityInsights, type ActivityInsightsInput } from './activity';
export { bodyInsights, type BodyInsightsInput } from './body';
export { dashboardInsights, type PeriodRecords } from './dashboard';
export { goalsInsights, type GoalsInsightsInput } from './goals';
export { habitsInsights, type HabitsInsightsInput } from './habits';
export { nutritionInsights, type NutritionInsightsInput } from './nutrition';
export { INSIGHT_RULES } from './rules';
export { sleepInsights, type SleepInsightsInput } from './sleep';
export { timelineInsights, type TimelineInsightsInput } from './timeline';
export { twinBodyInsights, type TwinBodyInsightsInput } from './twin';
export type {
  DayStyle,
  Highlight,
  InsightArg,
  InsightArgs,
  InsightModule,
  InsightSentence,
  InsightState,
  ModuleInsights,
} from './types';
