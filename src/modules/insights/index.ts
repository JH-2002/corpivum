/**
 * Módulo `insights` (ADR-0025): camada explicativa por regras, sem IA. Resumos em texto, destaques e
 * sinal de apoio para o dashboard e os módulos. Funções puras que devolvem chaves do i18n
 * (`insights.*`) e argumentos; o texto é montado em `src/components/insights`.
 */
export { bodyInsights, type BodyInsightsInput } from './body';
export { dashboardInsights, type PeriodRecords } from './dashboard';
export { habitsInsights, type HabitsInsightsInput } from './habits';
export { journalInsights, type JournalInsightsInput, type JournalMeta } from './journal';
export { moodInsights, moodSupportSignal, type MoodInsightsInput } from './mood';
export { INSIGHT_RULES } from './rules';
export { sleepInsights, type SleepInsightsInput } from './sleep';
export {
  brainInsights,
  brainThemes,
  twinBodyInsights,
  type BrainThemeData,
  type BrainThemes,
  type BrainThemesInput,
  type ThemeIndicator,
  type TwinBodyInsightsInput,
} from './twin';
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
