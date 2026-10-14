import { useFormatter, useTranslations } from 'next-intl';
import { deleteReminderAction, toggleReminderAction } from '@/app/(app)/habitos/reminder-actions';
import { SubmitButton } from '@/components/forms/FormFields';
import { DemoReadOnlyNotice } from '@/components/health/DemoModeBanner';
import { EntryActions } from '@/components/health/EntryActions';
import type { HealthMode } from '@/components/health/HealthPage';
import { ConfidenceBadge } from '@/components/ui/ConfidenceBadge';
import { WEEK_ORDER } from '@/lib/dates';
import type { HabitRecord } from '@/modules/habits';
import { formatTime, type ReminderPrefs, type ReminderRecord } from '@/modules/notifications';
import { ReminderForm, ReminderPrefsForm } from './ReminderForms';

/**
 * Lembretes (§33, LEG-F05): criados pela pessoa, enviados pelo servidor (JobQueue) mesmo com o app
 * fechado, no máximo um por lembrete por dia, com horário silencioso. Pausar e retomar sem perder o
 * lembrete. O e-mail não leva conteúdo de saúde.
 */
export function RemindersSection({
  reminders,
  prefs,
  habits,
  mode,
}: {
  reminders: ReminderRecord[];
  prefs: ReminderPrefs;
  habits: HabitRecord[];
  mode: HealthMode;
}) {
  const t = useTranslations('reminders');
  const th = useTranslations('habits');
  const format = useFormatter();
  const own = mode === 'own';
  const active = habits.filter((h) => !h.archived).map((h) => ({ id: h.id, name: h.name }));
  const label = (r: ReminderRecord) =>
    r.kind === 'habit'
      ? (habits.find((h) => h.id === r.habitId)?.name ?? t('kinds.habit'))
      : t('kinds.daily_log');
  const days = (r: ReminderRecord) =>
    r.weekdays.length === 0
      ? t('everyDay')
      : format.list(
          WEEK_ORDER.filter((d) => r.weekdays.includes(d)).map((d) => th(`weekdayShort.${d}`)),
          { type: 'conjunction' },
        );

  return (
    <section
      id="lembretes"
      aria-labelledby="reminders-title"
      className="flex scroll-mt-32 flex-col gap-4 rounded-lg border border-border bg-surface p-4"
    >
      <h2 id="reminders-title" className="text-base font-semibold">
        {t('title')}
      </h2>
      <p className="text-sm text-fg-muted">{t('intro')}</p>

      {reminders.length === 0 ? (
        <p className="text-sm">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-3" aria-label={t('listTitle')}>
          {reminders.map((r) => {
            const name = t('entry', { label: label(r), time: formatTime(r.timeMin) });
            return (
              <li key={r.id} className="flex flex-col gap-2 rounded-md border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="tabular font-semibold">{name}</p>
                  <ConfidenceBadge level={own ? 'INFORMADO' : 'DEMO'} />
                </div>
                <p className="text-sm text-fg-muted">
                  {days(r)} · {r.enabled ? t('active') : t('paused')}
                </p>
                {own ? (
                  <div className="flex flex-col gap-2">
                    <form action={toggleReminderAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="enabled" value={r.enabled ? 'false' : 'true'} />
                      <SubmitButton
                        variant="secondary"
                        aria-label={t(r.enabled ? 'pauseLabel' : 'resumeLabel', { label: name })}
                      >
                        {r.enabled ? t('pause') : t('resume')}
                      </SubmitButton>
                    </form>
                    <EntryActions id={r.id} itemLabel={name} deleteAction={deleteReminderAction}>
                      <ReminderForm values={r} habits={active} />
                    </EntryActions>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {own ? (
        <>
          <details>
            <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-primary">
              {t('form.newTitle')}
            </summary>
            <div className="mt-2">
              <ReminderForm
                habits={active}
                values={{ kind: 'habit', habitId: null, timeMin: 20 * 60, weekdays: [] }}
              />
            </div>
          </details>
          <details>
            <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-primary">
              {t('prefs.title')}
            </summary>
            <div className="mt-2">
              <ReminderPrefsForm prefs={prefs} />
            </div>
          </details>
        </>
      ) : (
        <DemoReadOnlyNotice publicDemo={mode === 'publicDemo'} />
      )}
    </section>
  );
}
