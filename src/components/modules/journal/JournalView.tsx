import Link from 'next/link';
import type { Route } from 'next';
import { useFormatter, useTranslations } from 'next-intl';
import { deleteJournalAction } from '@/app/(app)/diario/actions';
import { buttonClasses } from '@/components/ui/Button';
import { DemoReadOnlyNotice } from '@/components/health/DemoModeBanner';
import { EntryActions } from '@/components/health/EntryActions';
import type { HealthMode } from '@/components/health/HealthPage';
import { SupportNotice } from '@/components/health/SupportNotice';
import { ConfidenceBadge } from '@/components/ui/ConfidenceBadge';
import { StateView } from '@/components/ui/StateView';
import { addDays, weekday, WEEK_ORDER } from '@/lib/dates';
import { cn } from '@/lib/cn';
import { JOURNAL_TAGS, type JournalFilter, type JournalRecord } from '@/modules/journal';
import { JournalForm } from './JournalForm';

export type JournalLayout = 'lista' | 'calendario';

/** Calendário do mês de `anchor` (segunda a domingo), com quantas entradas há em cada dia. */
function MonthCalendar({
  anchor,
  entries,
  listHref,
}: {
  anchor: string;
  entries: JournalRecord[];
  listHref: string;
}) {
  const t = useTranslations('journal');
  const format = useFormatter();
  const first = `${anchor.slice(0, 8)}01`;
  const offset = (weekday(first) + 6) % 7;
  const start = addDays(first, -offset);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const weeks = Array.from({ length: 6 }, (_, w) => days.slice(w * 7, w * 7 + 7)).filter((week) =>
    week.some((d) => d.slice(0, 7) === anchor.slice(0, 7)),
  );
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(e.day, (counts.get(e.day) ?? 0) + 1);
  const monthTitle = format.dateTime(new Date(`${first}T12:00:00Z`), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return (
    <table className="w-full table-fixed border-collapse text-center text-sm">
      <caption className="mb-2 text-left font-semibold capitalize">{monthTitle}</caption>
      <thead>
        <tr>
          {WEEK_ORDER.map((d) => (
            <th key={d} scope="col" className="p-1 font-semibold">
              <abbr title={t(`weekdayLong.${d}`)}>{t(`weekdayShort.${d}`)}</abbr>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week[0]}>
            {week.map((day) => {
              const inMonth = day.slice(0, 7) === anchor.slice(0, 7);
              const count = counts.get(day) ?? 0;
              const label = format.dateTime(new Date(`${day}T12:00:00Z`), {
                dateStyle: 'long',
                timeZone: 'UTC',
              });
              return (
                <td key={day} className="p-0.5">
                  {inMonth && count > 0 ? (
                    <a
                      href={`${listHref}#dia-${day}`}
                      aria-label={t('calendarDayEntries', { date: label, count })}
                      className="flex min-h-11 flex-col items-center justify-center rounded-md bg-primary-soft font-semibold text-primary-soft-fg"
                    >
                      {Number(day.slice(8))}
                      <span aria-hidden="true" className="text-xs">
                        ● {count}
                      </span>
                    </a>
                  ) : inMonth ? (
                    <span className="flex min-h-11 items-center justify-center rounded-md">
                      {Number(day.slice(8))}
                    </span>
                  ) : null}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Tela do diário (§19): nova entrada, filtros por data (período global), humor e etiquetas — sem busca no
 * texto, que é cifrado (LEG-S02) — e visualização em lista ou calendário. Apoio CVV/SAMU visível (§48).
 */
export function JournalView({
  entries,
  today,
  mode,
  basePath,
  layout,
  filter,
}: {
  entries: JournalRecord[];
  today: string;
  mode: HealthMode;
  basePath: '/diario' | '/demo/diario';
  layout: JournalLayout;
  filter: JournalFilter;
}) {
  const t = useTranslations('journal');
  const format = useFormatter();
  const own = mode === 'own';
  const level = own ? 'INFORMADO' : 'DEMO';
  const query = (next: Partial<{ vista: JournalLayout }>) => {
    const p = new URLSearchParams();
    if (filter.mood) p.set('humor', String(filter.mood));
    if (filter.tag) p.set('etiqueta', filter.tag);
    p.set('vista', next.vista ?? layout);
    return `${basePath}?${p.toString()}`;
  };
  const longDay = (iso: string) =>
    format.dateTime(new Date(`${iso}T12:00:00Z`), { dateStyle: 'full', timeZone: 'UTC' });
  const seenDays = new Set<string>();

  return (
    <div className="flex flex-col gap-6">
      <section
        id="novo"
        aria-labelledby="journal-new"
        className="scroll-mt-32 rounded-lg border border-border bg-surface p-4"
      >
        <h2 id="journal-new" className="mb-3 text-base font-semibold">
          {t('newTitle')}
        </h2>
        {own ? (
          <JournalForm maxDay={today} values={{ day: today, content: '', mood: null, tags: [] }} />
        ) : (
          <DemoReadOnlyNotice publicDemo={mode === 'publicDemo'} />
        )}
      </section>

      <section
        aria-labelledby="journal-filters"
        className="rounded-lg border border-border bg-surface p-4"
      >
        <h2 id="journal-filters" className="mb-1 text-base font-semibold">
          {t('filtersTitle')}
        </h2>
        <p className="mb-3 text-sm text-fg-muted">{t('filtersHint')}</p>
        <form method="get" action={basePath} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="vista" value={layout} />
          <div className="flex flex-col gap-1">
            <label htmlFor="journal-filter-mood" className="text-sm font-semibold">
              {t('form.mood')}
            </label>
            <select
              id="journal-filter-mood"
              name="humor"
              defaultValue={filter.mood?.toString() ?? ''}
              className="min-h-11 rounded-md border border-border-strong bg-surface px-3"
            >
              <option value="">{t('filterAll')}</option>
              {[1, 2, 3, 4, 5].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="journal-filter-tag" className="text-sm font-semibold">
              {t('form.tags')}
            </label>
            <select
              id="journal-filter-tag"
              name="etiqueta"
              defaultValue={filter.tag ?? ''}
              className="min-h-11 rounded-md border border-border-strong bg-surface px-3"
            >
              <option value="">{t('filterAll')}</option>
              {JOURNAL_TAGS.map((tag) => (
                <option key={tag} value={tag}>
                  {t(`tags.${tag}`)}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={buttonClasses('secondary')}>
            {t('filterApply')}
          </button>
        </form>
        <nav aria-label={t('layoutLabel')} className="mt-3 flex gap-2">
          {(['lista', 'calendario'] as const).map((v) => (
            <Link
              key={v}
              href={query({ vista: v }) as Route}
              aria-current={layout === v ? 'page' : undefined}
              className={cn(
                buttonClasses(layout === v ? 'primary' : 'ghost'),
                layout === v && 'underline underline-offset-4',
              )}
            >
              {t(`layout.${v}`)}
            </Link>
          ))}
        </nav>
      </section>

      {entries.length === 0 ? (
        <StateView state="no-data" />
      ) : layout === 'calendario' ? (
        <section className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-2 flex justify-end">
            <ConfidenceBadge level={level} />
          </div>
          <MonthCalendar
            anchor={entries[0]?.day ?? today}
            entries={entries}
            listHref={query({ vista: 'lista' })}
          />
        </section>
      ) : (
        <section aria-labelledby="journal-list" className="flex flex-col gap-3">
          <h2 id="journal-list" className="text-base font-semibold">
            {t('listTitle', { count: entries.length })}
          </h2>
          <ul className="flex flex-col gap-3">
            {entries.map((e) => {
              const anchor = seenDays.has(e.day) ? undefined : `dia-${e.day}`;
              seenDays.add(e.day);
              return (
                <li
                  key={e.id}
                  id={anchor}
                  className="scroll-mt-32 rounded-lg border border-border bg-surface p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="font-semibold">{longDay(e.day)}</h3>
                    <ConfidenceBadge level={level} />
                  </div>
                  <p className="text-sm text-fg-muted">
                    {e.mood !== null ? t('entryMood', { value: e.mood }) : t('entryNoMood')}
                    {e.tags.length ? ` · ${e.tags.map((tag) => t(`tags.${tag}`)).join(', ')}` : ''}
                  </p>
                  {e.content ? <p className="mt-2 whitespace-pre-line">{e.content}</p> : null}
                  {own ? (
                    <div className="mt-2">
                      <EntryActions
                        id={e.id}
                        itemLabel={longDay(e.day)}
                        deleteAction={deleteJournalAction}
                      >
                        <JournalForm
                          maxDay={today}
                          values={{
                            id: e.id,
                            day: e.day,
                            content: e.content ?? '',
                            mood: e.mood,
                            tags: e.tags,
                          }}
                        />
                      </EntryActions>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <SupportNotice />
    </div>
  );
}
