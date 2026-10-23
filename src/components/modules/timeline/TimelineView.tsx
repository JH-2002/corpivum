import Link from 'next/link';
import type { Route } from 'next';
import { useFormatter, useTranslations } from 'next-intl';
import { formatDecimal, formatDuration, TREND_ARROW, trendOf } from '@/components/health/format';
import type { HealthMode } from '@/components/health/HealthPage';
import { PeriodSummary } from '@/components/insights/PeriodInsights';
import { formatGoalValue } from '@/components/modules/goals/goal-value';
import { ConfidenceBadge } from '@/components/ui/ConfidenceBadge';
import { OpenQuickLogButton } from '@/components/shell/OpenQuickLogButton';
import { StateView } from '@/components/ui/StateView';
import { WeeklyList } from '@/components/health/WeeklyList';
import { cn } from '@/lib/cn';
import { groupByWeek } from '@/lib/dates';
import type { DateRange } from '@/lib/period';
import { timelineInsights } from '@/modules/insights';
import {
  TIMELINE_DOMAINS,
  type TimelineDay,
  type TimelineDomain,
  type TimelineItem,
} from '@/modules/timeline';

/**
 * Timeline pessoal (§31): registros por dia, do mais recente ao mais antigo, filtráveis por domínio
 * (links com `?dominio=`, funcionam sem JS) e pelo período global. Marcos automáticos sem comemoração
 * ligada a peso ou comida (LEG-M06, LEG-M07). Mesma tela para dados próprios e demo.
 * Modo privacidade (`hidden`, ADR-0035): as medições chegam sem peso (`maskTimeline`) e dizem "valores
 * ocultos". `filters={false}` tira os filtros (modo apresentação).
 */
export function TimelineView({
  days,
  domain,
  basePath,
  range,
  today,
  mode,
  hidden = false,
  filters: showFilters = true,
}: {
  days: TimelineDay[];
  domain: TimelineDomain | null;
  basePath: '/timeline' | '/demo/timeline';
  range: DateRange;
  today: string;
  mode: HealthMode;
  hidden?: boolean;
  filters?: boolean;
}) {
  const t = useTranslations('timeline');
  const ts = useTranslations('states');
  const tm = useTranslations('privacyMode');
  const tn = useTranslations('nutrition');
  const ta = useTranslations('activity');
  const tg = useTranslations('goals');
  const format = useFormatter();
  const own = mode === 'own';
  const longDay = (iso: string) =>
    format.dateTime(new Date(`${iso}T12:00:00Z`), { dateStyle: 'full', timeZone: 'UTC' });
  const filters: Array<{ value: TimelineDomain | null; label: string }> = [
    { value: null, label: t('all') },
    ...TIMELINE_DOMAINS.map((d) => ({ value: d, label: t(`domains.${d}`) })),
  ];

  function text(item: TimelineItem): string {
    switch (item.kind) {
      case 'sleep':
        return [
          t('items.sleep', { duration: formatDuration(item.durationMin) }),
          item.quality !== null ? t('items.sleepQuality', { value: item.quality }) : null,
        ]
          .filter(Boolean)
          .join(' · ');
      case 'activity':
        return [
          t('items.activity', {
            type: ta(`types.${item.type}`),
            duration: formatDuration(item.durationMin),
          }),
          item.sets > 0 ? t('items.activitySets', { count: item.sets }) : null,
        ]
          .filter(Boolean)
          .join(' · ');
      case 'habits':
        return t('items.habits', { count: item.done });
      case 'body': {
        // O rótulo da linha já diz "Corpo": aqui só os valores (nada de "Corpo: Medição do corpo").
        const parts: string[] = [];
        if (item.weightKg !== null) {
          parts.push(t('items.bodyWeight', { weight: formatDecimal(item.weightKg) }));
        }
        const trend = trendOf(item.weightChangeKg, 0.05);
        if (item.weightChangeKg !== null && trend) {
          parts.push(
            t('items.bodyChange', {
              arrow: TREND_ARROW[trend],
              delta: formatDecimal(Math.abs(item.weightChangeKg)),
              word: trend,
            }),
          );
        }
        if (item.otherFields > 0) {
          const key = item.weightKg !== null ? 'items.bodyOther' : 'items.bodyMeasures';
          parts.push(t(key, { count: item.otherFields }));
        }
        if (parts.length === 0) parts.push(t('items.body'));
        if (hidden) parts.push(tm('valuesHidden'));
        return parts.join(' · ');
      }
      case 'meal':
        return t('items.meal', { category: tn(`categories.${item.category}`), time: item.time });
      case 'water':
        return t('items.water', { ml: item.ml });
      case 'milestone':
        return item.milestone === 'new_habit'
          ? t('items.newHabit', { name: item.habitName })
          : t('items.goalReached', {
              metric: tg(`metrics.${item.metric}`),
              value: formatGoalValue(item.metric, item.value, (m) => tg(`units.${m}`)),
              target: formatGoalValue(item.metric, item.target, (m) => tg(`units.${m}`)),
            });
    }
  }

  const levelOf = (item: TimelineItem) =>
    !own ? 'DEMO' : item.kind === 'milestone' ? 'ESTIMADO' : 'INFORMADO';

  return (
    <div className="flex flex-col gap-6">
      <PeriodSummary insights={timelineInsights({ days, range, today })} demo={!own} />

      {showFilters ? (
        <nav aria-label={t('filterLabel')} className="flex flex-wrap gap-2">
          {filters.map((f) => {
            const current = f.value === domain;
            const href = (f.value ? `${basePath}?dominio=${f.value}` : basePath) as Route;
            return (
              <Link
                key={f.label}
                href={href}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold',
                  current
                    ? 'border-primary bg-primary-soft text-fg'
                    : 'border-border-strong bg-surface text-fg',
                )}
              >
                {current ? <span aria-hidden="true">✓ </span> : null}
                {f.label}
              </Link>
            );
          })}
        </nav>
      ) : null}

      {days.length === 0 ? (
        <StateView
          state="no-data"
          nextStep={mode === 'own' ? t('nextStep') : ts('nextStepDemo')}
          action={
            mode === 'own' ? (
              <OpenQuickLogButton>{t('nextStepAction')}</OpenQuickLogButton>
            ) : undefined
          }
        />
      ) : (
        <section aria-labelledby="timeline-list" className="flex flex-col gap-4">
          <h2 id="timeline-list" className="text-base font-semibold">
            {t('listTitle')}
          </h2>
          <WeeklyList
            weeks={groupByWeek(days, (d) => d.day).map((w) => ({
              start: w.start,
              end: w.end,
              content: <ol key={w.start} className="flex flex-col gap-4">{w.items.map(dayItem)}</ol>,
            }))}
          />
        </section>
      )}
    </div>
  );

  function dayItem(d: TimelineDay) {
    // Um selo por cartão quando todas as linhas têm a mesma origem (na demo, sempre DEMO); se as origens
    // diferem (registro INFORMADO e marco ESTIMADO no mesmo dia), cada linha leva o seu.
    const levels = new Set(d.items.map(levelOf));
    const cardLevel = levels.size === 1 ? [...levels][0] : undefined;
    return (
      <li key={d.day} className="hm-row rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h4 className="font-semibold">
              <time dateTime={d.day}>{longDay(d.day)}</time>
            </h4>
            <p className="text-sm text-fg-muted">{t('dayItems', { count: d.items.length })}</p>
          </div>
          {cardLevel ? <ConfidenceBadge level={cardLevel} /> : null}
        </div>
        <ul className="mt-2 flex flex-col gap-2">
          {d.items.map((item, i) => (
            <li
              key={`${item.kind}-${'id' in item ? item.id : i}`}
              className="flex flex-wrap items-start justify-between gap-2 border-t border-border pt-2 first:border-t-0 first:pt-0"
            >
              <p>
                <span className="font-semibold">{t(`kindLabels.${item.kind}`)}: </span>
                <span className="tabular">{text(item)}</span>
              </p>
              {cardLevel ? null : <ConfidenceBadge level={levelOf(item)} />}
            </li>
          ))}
        </ul>
      </li>
    );
  }
}
