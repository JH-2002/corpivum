import Link from 'next/link';
import type { Route } from 'next';
import { useFormatter, useTranslations } from 'next-intl';
import { ConfidenceBadge } from '@/components/ui/ConfidenceBadge';
import { APP_TIME_ZONE } from '@/lib/dates';
import type { HabitRecord } from '@/modules/habits';
import { upcoming, type ReminderPrefs, type ReminderRecord } from '@/modules/notifications';

/** "Próximos lembretes" do painel (§11 item 6, pendência do ADR-0021): os próximos três, em ordem. */
export function UpcomingReminders({
  reminders,
  prefs,
  habits,
  now,
  manageHref,
  demo,
}: {
  reminders: ReminderRecord[];
  prefs: ReminderPrefs;
  habits: HabitRecord[];
  now: Date;
  manageHref: Route;
  demo: boolean;
}) {
  const t = useTranslations('dashboard.upcoming');
  const tr = useTranslations('reminders');
  const format = useFormatter();
  const active = new Set(habits.filter((h) => !h.archived).map((h) => h.id));
  const next = upcoming(reminders, now, APP_TIME_ZONE, prefs, active);
  const label = (r: ReminderRecord) =>
    r.kind === 'habit'
      ? (habits.find((h) => h.id === r.habitId)?.name ?? tr('kinds.habit'))
      : tr('kinds.daily_log');
  return (
    <section
      aria-labelledby="upcoming-reminders"
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="upcoming-reminders" className="text-base font-semibold">
          {t('title')}
        </h2>
        <ConfidenceBadge level={demo ? 'DEMO' : 'INFORMADO'} />
      </div>
      {next.length === 0 ? (
        <p className="text-sm">{t('none')}</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {next.map(({ reminder, at }) => (
            <li key={reminder.id} className="tabular">
              {tr('upcoming.when', {
                label: label(reminder),
                when: format.dateTime(at, {
                  weekday: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: APP_TIME_ZONE,
                }),
              })}
            </li>
          ))}
        </ul>
      )}
      <Link
        href={manageHref}
        className="inline-flex min-h-11 items-center text-sm font-semibold text-primary"
      >
        {t('manage')}
      </Link>
    </section>
  );
}
