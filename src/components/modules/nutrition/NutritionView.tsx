import { useFormatter, useTranslations } from 'next-intl';
import {
  addWaterAction,
  deleteMealAction,
  removeWaterAction,
  setCalorieEstimateAction,
} from '@/app/(app)/alimentacao/actions';
import { TimeChart } from '@/components/charts/TimeChart';
import { SubmitButton } from '@/components/forms/FormFields';
import { ExampleForm } from '@/components/forms/ExampleForm';
import { EntryActions } from '@/components/health/EntryActions';
import type { HealthMode } from '@/components/health/HealthPage';
import { WeeklyList } from '@/components/health/WeeklyList';
import { HiddenEditNotice, Masked } from '@/components/privacy-mode/Masked';
import { PeriodInsights, summaryTextId } from '@/components/insights/PeriodInsights';
import { ConfidenceBadge } from '@/components/ui/ConfidenceBadge';
import { StateView } from '@/components/ui/StateView';
import { groupByWeek, toLocalDateTime } from '@/lib/dates';
import type { DateRange } from '@/lib/period';
import { nutritionInsights } from '@/modules/insights';
import {
  dailyMealCounts,
  dailyWaterMl,
  dayKcalTotal,
  MEAL_PERCEPTIONS,
  WATER_QUICK_ML,
  type MealRecord,
  type WaterRecord,
} from '@/modules/nutrition';
import { MealForm } from './MealForm';

/**
 * Tela de alimentação (§25, LEG-M07, LEG-M08): registro simples por refeição, água em um toque, contagem e
 * percepções, sem rótulo de comida, sem cardápio e sem calorias por padrão. Mesma tela para dados próprios
 * e demo (somente leitura, selo DEMO). Modo privacidade (`hidden`, ADR-0035): as refeições chegam sem a
 * estimativa de calorias (`maskNutritionScreen`); o total do dia diz "oculto" e a edição fica bloqueada (salvar
 * sem o valor apagaria a estimativa).
 */
export function NutritionView({
  meals,
  previousMeals,
  water,
  waterToday,
  estimateEnabled,
  range,
  today,
  mode,
  hidden = false,
}: {
  meals: MealRecord[];
  previousMeals: MealRecord[];
  water: WaterRecord[];
  waterToday: WaterRecord[];
  estimateEnabled: boolean;
  range: DateRange;
  today: string;
  mode: HealthMode;
  hidden?: boolean;
}) {
  const t = useTranslations('nutrition');
  const format = useFormatter();
  const own = mode === 'own';
  const level = (l: 'INFORMADO' | 'ESTIMADO') => (own ? l : 'DEMO');
  const maxDateTime = toLocalDateTime(new Date());
  const longDay = (iso: string) =>
    format.dateTime(new Date(`${iso}T12:00:00Z`), { dateStyle: 'full', timeZone: 'UTC' });
  const insights = nutritionInsights({ meals, water, previousMeals, range, today });
  const waterTodayMl = waterToday.reduce((acc, w) => acc + w.ml, 0);
  const kcalToday = estimateEnabled ? dayKcalTotal(meals, today) : null;
  const hasData = meals.length > 0 || water.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-fg-muted">{t('intro')}</p>
      <PeriodInsights insights={insights} demo={!own} />

      <section
        id="novo"
        aria-labelledby="meal-new"
        className="scroll-mt-32 rounded-lg border border-border bg-surface p-4"
      >
        <h2 id="meal-new" className="mb-3 text-base font-semibold">
          {t('newTitle')}
        </h2>
        {own ? (
          <MealForm
            maxDateTime={maxDateTime}
            estimateEnabled={estimateEnabled}
            values={{
              eatenAt: maxDateTime,
              category: 'lunch',
              description: null,
              hunger: null,
              fullness: null,
              satisfaction: null,
              kcalEstimate: null,
              note: null,
            }}
          />
        ) : (
          <ExampleForm publicDemo={mode === 'publicDemo'}>
            {/* Sem calorias no exemplo: nada que sugira meta ou restrição (LEG-M07). */}
            <MealForm
              example
              maxDateTime={maxDateTime}
              estimateEnabled={estimateEnabled}
              values={{
                eatenAt: maxDateTime,
                category: 'lunch',
                description: t('exampleDescription'),
                hunger: 3,
                fullness: 3,
                satisfaction: 4,
                kcalEstimate: null,
                note: null,
              }}
            />
          </ExampleForm>
        )}
      </section>

      <section
        aria-labelledby="water-title"
        className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 id="water-title" className="text-base font-semibold">
            {t('water.title')}
          </h2>
          <ConfidenceBadge level={level('INFORMADO')} />
        </div>
        <p className="tabular" aria-live="polite">
          {waterTodayMl > 0 ? t('water.today', { ml: waterTodayMl }) : t('water.todayNone')}
        </p>
        {own ? (
          <>
            <div className="flex flex-wrap gap-2">
              {WATER_QUICK_ML.map((ml) => (
                <form key={ml} action={addWaterAction}>
                  <input type="hidden" name="day" value={today} />
                  <input type="hidden" name="ml" value={ml} />
                  <SubmitButton variant="secondary" aria-label={t('water.addLabel', { ml })}>
                    {t('water.add', { ml })}
                  </SubmitButton>
                </form>
              ))}
            </div>
            <form action={addWaterAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="day" value={today} />
              <div className="flex flex-col gap-1">
                <label htmlFor="water-custom" className="text-sm font-semibold">
                  {t('water.custom')}
                </label>
                <input
                  id="water-custom"
                  name="ml"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={5000}
                  className="min-h-11 w-32 rounded-md border border-border-strong bg-surface px-3 text-base"
                />
              </div>
              <SubmitButton variant="secondary">{t('water.customSave')}</SubmitButton>
            </form>
            {waterToday.length > 0 ? (
              <details>
                <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-primary">
                  {t('water.listTitle')}
                </summary>
                <ul className="flex flex-col gap-2 pt-1">
                  {waterToday.map((w) => (
                    <li key={w.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="tabular">{w.ml} ml</span>
                      <form action={removeWaterAction}>
                        <input type="hidden" name="id" value={w.id} />
                        <SubmitButton
                          variant="secondary"
                          aria-label={t('water.removeLabel', { ml: w.ml })}
                        >
                          {t('water.remove')}
                        </SubmitButton>
                      </form>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </>
        ) : null}
      </section>

      {own ? (
        <form
          action={setCalorieEstimateAction}
          className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-4 text-sm"
          aria-label={t('estimate.title')}
        >
          <div className="flex flex-1 flex-col gap-2">
            <p>{estimateEnabled ? t('estimate.on') : t('estimate.off')}</p>
            {/* Total do dia: o único número desta tela que os Destaques não trazem. */}
            {estimateEnabled ? (
              <p className="flex flex-wrap items-center gap-2">
                <span className="text-fg-muted">{t('stats.kcalToday')}:</span>
                <strong className="tabular">
                  <Masked hidden={hidden}>{kcalToday !== null ? `${kcalToday} kcal` : '—'}</Masked>
                </strong>
                <ConfidenceBadge level="ESTIMADO" />
              </p>
            ) : null}
          </div>
          <input type="hidden" name="enabled" value={estimateEnabled ? 'false' : 'true'} />
          <SubmitButton variant="secondary">
            {estimateEnabled ? t('estimate.disable') : t('estimate.enable')}
          </SubmitButton>
        </form>
      ) : null}

      {!hasData ? (
        <StateView state="no-data" />
      ) : (
        <>
          {/* Os números do período (dias com refeição, água, satisfação) ficam só nos Destaques. */}
          <TimeChart
            title={t('mealsChart')}
            badge={level('INFORMADO')}
            guide="meals"
            describedBy={summaryTextId('nutrition')}
            data={dailyMealCounts(meals, range)}
            series={[
              {
                key: 'meals',
                label: t('mealsSeries'),
                kind: 'bar',
                integer: true,
                color: 'var(--hm-chart-1)',
              },
            ]}
          />
          <TimeChart
            title={t('waterChart')}
            badge={level('INFORMADO')}
            guide="water"
            describedBy={summaryTextId('nutrition')}
            data={dailyWaterMl(water, range)}
            series={[
              {
                key: 'ml',
                label: t('waterSeries'),
                unit: 'ml',
                kind: 'bar',
                color: 'var(--hm-chart-1)',
              },
            ]}
          />

          {meals.length > 0 ? (
            <section aria-labelledby="meal-list" className="flex flex-col gap-3">
              <h2 id="meal-list" className="text-base font-semibold">
                {t('listTitle')}
              </h2>
              <WeeklyList
                weeks={groupByWeek([...meals].reverse(), (m) => m.day).map((w) => ({
                  start: w.start,
                  end: w.end,
                  content: (
                    <ul className="flex flex-col gap-3">
                      {w.items.map((m) => {
                        const label = `${longDay(m.day)}, ${t(`categories.${m.category}`)}`;
                        return (
                          <li key={m.id} className="rounded-lg border border-border bg-surface p-4">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <h4 className="font-semibold">{longDay(m.day)}</h4>
                              <ConfidenceBadge level={level('INFORMADO')} />
                            </div>
                            <p className="tabular">
                              {t('entrySummary', {
                                category: t(`categories.${m.category}`),
                                time: m.time,
                              })}
                            </p>
                            {m.description ? (
                              <p className="text-sm whitespace-pre-line">{m.description}</p>
                            ) : null}
                            <p className="text-sm text-fg-muted">
                              {MEAL_PERCEPTIONS.filter((p) => m[p] !== null)
                                .map((p) =>
                                  t('entryPerception', {
                                    label: t(`perceptions.${p}`),
                                    value: m[p] ?? 0,
                                  }),
                                )
                                .join(' · ')}
                            </p>
                            {m.kcalEstimate !== null ? (
                              <p className="flex flex-wrap items-center gap-2 text-sm">
                                {t('entryKcal', { kcal: m.kcalEstimate })}
                                <ConfidenceBadge level={level('ESTIMADO')} />
                              </p>
                            ) : null}
                            {m.note ? (
                              <p className="mt-1 text-sm whitespace-pre-line">{m.note}</p>
                            ) : null}
                            {own ? (
                              <div className="mt-2">
                                <EntryActions
                                  id={m.id}
                                  itemLabel={label}
                                  deleteAction={deleteMealAction}
                                >
                                  {hidden && estimateEnabled ? (
                                    <HiddenEditNotice />
                                  ) : (
                                    <MealForm
                                      maxDateTime={maxDateTime}
                                      estimateEnabled={estimateEnabled}
                                      values={{
                                        ...m,
                                        eatenAt: toLocalDateTime(new Date(m.eatenAt)),
                                      }}
                                    />
                                  )}
                                </EntryActions>
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  ),
                }))}
              />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
