import { Moon, Orbit, PersonStanding, ListChecks, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { Route } from 'next';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Sparkline } from '@/components/charts/Sparkline';
import { TimeChart } from '@/components/charts/TimeChart';
import { formatDecimal, formatDuration, TREND_ARROW, trendOf } from '@/components/health/format';
import { HabitCheckButton } from '@/components/health/HabitCheckButton';
import { ScoreReviewForm } from '@/components/health/ScoreReviewForm';
import { PeriodInsights, summaryTextId } from '@/components/insights/PeriodInsights';
import { ConfidenceBadge, type ConfidenceLevel } from '@/components/ui/ConfidenceBadge';
import { StateView } from '@/components/ui/StateView';
import type { DashboardData } from '@/modules/health/dashboard';
import { ScoreExplanation } from './ScoreExplanation';

/** Onde o dashboard está: dados próprios, demo dentro da conta ou demo público (LEG-X02). */
export type DashboardMode = 'own' | 'appDemo' | 'publicDemo';

/** Selo: dados de demonstração sempre DEMO (ADR-0021); senão o nível real. */
function badgeFor(mode: DashboardMode, level: ConfidenceLevel): ConfidenceLevel {
  return mode === 'own' ? level : 'DEMO';
}

function DomainCard({
  title,
  href,
  icon: Icon,
  tone,
  badge,
  value,
  variation,
  origin,
  spark,
  noData,
}: {
  title: string;
  href: Route;
  icon: LucideIcon;
  tone: string;
  badge: ConfidenceLevel;
  value: ReactNode;
  variation?: string | null;
  origin: string;
  spark?: ReactNode;
  noData: boolean;
}) {
  const t = useTranslations('dashboard');
  return (
    <article className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold">
          <Icon className={`size-5 ${tone}`} aria-hidden="true" />
          <Link href={href} className="underline-offset-4 hover:underline">
            {title}
          </Link>
        </h3>
        <ConfidenceBadge level={badge} />
      </div>
      {noData ? (
        <p className="text-sm text-fg-muted">{t('cardNoData')}</p>
      ) : (
        <>
          <p className="tabular text-2xl font-bold">{value}</p>
          {variation ? <p className="text-sm text-fg-muted">{variation}</p> : null}
          {spark}
          <details className="text-sm">
            <summary className="inline-flex min-h-11 cursor-pointer items-center text-primary">
              {t('origin')}
            </summary>
            <p className="text-fg-muted">{origin}</p>
          </details>
        </>
      )}
    </article>
  );
}

/** Hábitos de hoje com check rápido (§11.5). Aparece também quando não há registros no período. */
function TodayHabits({ data, mode }: { data: DashboardData; mode: DashboardMode }) {
  const t = useTranslations('dashboard');
  const b = (level: ConfidenceLevel) => badgeFor(mode, level);
  return (
    <section
      aria-labelledby="dash-habits"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 id="dash-habits" className="text-base font-semibold">
          {t('todayHabits')}
        </h2>
        <ConfidenceBadge level={b('INFORMADO')} />
      </div>
      {data.todayHabits.length === 0 ? (
        <p className="text-sm text-fg-muted">
          {t('noHabits')}{' '}
          {mode === 'own' ? (
            <Link href="/habitos" className="font-semibold text-primary underline">
              {t('createHabit')}
            </Link>
          ) : null}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {data.todayHabits.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <p className="font-medium">{h.name}</p>
                <p className="text-sm text-fg-muted">
                  {h.scheduled ? t('scheduledToday') : t('notScheduledToday')}
                  {h.streak !== null && h.streak > 0
                    ? ` · ${t('streak', { count: h.streak })}`
                    : ''}
                </p>
              </div>
              <HabitCheckButton
                habitId={h.id}
                name={h.name}
                day={data.today}
                done={h.done}
                readOnly={mode !== 'own'}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Dashboard "Seu estado atual" (§11, §12). Estados: vazio (nunca registrou), sem dados no período,
 * parcial (algum domínio sem registro) e completo. Todo valor tem selo (§39). Nenhum gráfico vazio.
 */
export function Dashboard({
  data,
  mode,
  emptyAction,
}: {
  data: DashboardData;
  mode: DashboardMode;
  /** Ação do estado vazio (ex.: abrir o registro rápido). */
  emptyAction?: ReactNode;
}) {
  const t = useTranslations('dashboard');
  const tp = useTranslations('pages.home');
  const td = useTranslations('disclaimer');
  const base = mode === 'publicDemo' ? '/demo' : '';
  const link = (path: string) => `${base}${path}` as Route;
  const b = (level: ConfidenceLevel) => badgeFor(mode, level);

  if (data.state === 'empty') {
    return (
      <StateView
        state="empty"
        emptyTitle={tp('emptyTitle')}
        emptyDescription={tp('emptyDescription')}
        action={emptyAction}
      />
    );
  }
  if (data.state === 'no-data') {
    return (
      <div className="flex flex-col gap-6">
        <StateView state="no-data" action={emptyAction} />
        {data.todayHabits.length > 0 ? <TodayHabits data={data} mode={mode} /> : null}
      </div>
    );
  }

  const { cards, score, previousScore } = data;
  const scoreTrend = trendOf(
    score.value !== null && previousScore.value !== null ? score.value - previousScore.value : null,
  );

  const sleepTrend = trendOf(cards.sleep.deltaMinutes);
  const habitsTrend = trendOf(cards.habits.deltaPoints);
  const bodyTrend = trendOf(cards.body.changeKg);

  const content = (
    <div className="flex flex-col gap-6">
      {/* Resumo em texto por regras, destaques e, se for o caso, apoio (ADR-0025). */}
      <PeriodInsights insights={data.insights} demo={mode !== 'own'} />

      <section
        aria-labelledby="dash-score"
        data-tour="score"
        className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 id="dash-score" className="text-base font-semibold">
            {t('score.title')}
          </h2>
          <ConfidenceBadge level={b('ESTIMADO')} />
        </div>
        {score.value === null ? (
          <p className="text-sm text-fg-muted">{t('score.insufficient')}</p>
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="tabular text-4xl font-bold">
              {score.value}
              <span className="text-base font-normal text-fg-muted"> {t('score.outOf')}</span>
            </p>
            {scoreTrend && previousScore.value !== null ? (
              <p className="text-sm text-fg-muted">
                <span aria-hidden="true">{TREND_ARROW[scoreTrend]} </span>
                {t(`score.trend.${scoreTrend}`, {
                  points: Math.abs(score.value - previousScore.value),
                })}
              </p>
            ) : null}
          </div>
        )}
        {score.partial ? <p className="text-sm font-semibold">{t('score.partial')}</p> : null}
        <p className="text-sm text-fg-muted">{td('wellbeingScore')}</p>
        <ScoreExplanation score={score} />
        {mode === 'own' ? (
          <ScoreReviewForm version={score.version} />
        ) : (
          <p className="text-sm text-fg-muted">{t('score.reviewDemo')}</p>
        )}
      </section>

      <section aria-labelledby="dash-cards" data-tour="cards" className="flex flex-col gap-3">
        <h2 id="dash-cards" className="text-base font-semibold">
          {t('cardsTitle')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <DomainCard
            title={t('cards.sleep')}
            href={link('/sono')}
            icon={Moon}
            tone="text-sleep"
            badge={b('ESTIMADO')}
            noData={cards.sleep.state === 'no-data'}
            value={cards.sleep.avgMinutes !== null ? formatDuration(cards.sleep.avgMinutes) : null}
            variation={
              sleepTrend && cards.sleep.deltaMinutes !== null
                ? `${TREND_ARROW[sleepTrend]} ${t(`variation.duration.${sleepTrend}`, {
                    value: formatDuration(cards.sleep.deltaMinutes),
                  })}`
                : null
            }
            origin={t('origins.sleep', { count: cards.sleep.count })}
            spark={<Sparkline data={cards.sleep.spark} color="var(--hm-domain-sleep)" />}
          />
          <DomainCard
            title={t('cards.habits')}
            href={link('/habitos')}
            icon={ListChecks}
            tone="text-primary"
            badge={b('ESTIMADO')}
            noData={cards.habits.state === 'no-data'}
            value={cards.habits.completion !== null ? `${cards.habits.completion}%` : null}
            variation={
              habitsTrend && cards.habits.deltaPoints !== null
                ? `${TREND_ARROW[habitsTrend]} ${t(`variation.percent.${habitsTrend}`, {
                    value: Math.abs(cards.habits.deltaPoints),
                  })}`
                : null
            }
            origin={t('origins.habits', { count: cards.habits.activeHabits })}
            spark={<Sparkline data={cards.habits.spark} color="var(--hm-primary)" />}
          />
          <DomainCard
            title={t('cards.body')}
            href={link('/corpo')}
            icon={PersonStanding}
            tone="text-body"
            badge={b('INFORMADO')}
            noData={cards.body.state === 'no-data'}
            value={cards.body.weightKg !== null ? `${formatDecimal(cards.body.weightKg)} kg` : null}
            variation={
              bodyTrend && cards.body.changeKg !== null
                ? `${TREND_ARROW[bodyTrend]} ${t(`variation.kg.${bodyTrend}`, {
                    value: formatDecimal(Math.abs(cards.body.changeKg)),
                  })}`
                : null
            }
            origin={t('origins.body')}
            spark={<Sparkline data={cards.body.spark} color="var(--hm-domain-body)" />}
          />
        </div>
      </section>

      <div data-tour="chart">
        <TimeChart
          title={t('combined.title')}
          description={t('combined.description')}
          badge={b('INFORMADO')}
          guide="combined"
          describedBy={summaryTextId('dashboard')}
          data={data.combined}
          series={[
            {
              key: 'sleepHours',
              label: t('combined.sleep'),
              unit: 'h',
              kind: 'bar',
              color: 'var(--hm-domain-sleep)',
            },
          ]}
        />
      </div>

      <TodayHabits data={data} mode={mode} />

      {mode === 'publicDemo' ? null : (
        <Link
          href="/twin"
          className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 hover:bg-surface-muted"
        >
          <Orbit className="size-6 text-primary" aria-hidden="true" />
          <span>
            <span className="block font-semibold">{t('twin.title')}</span>
            <span className="block text-sm text-fg-muted">{t('twin.body')}</span>
          </span>
        </Link>
      )}
    </div>
  );

  return data.state === 'partial' ? <StateView state="partial">{content}</StateView> : content;
}
