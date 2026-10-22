import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { Tour } from '@/components/tour/Tour';
import { buttonClasses } from '@/components/ui/Button';
import { UpcomingReminders } from '@/components/modules/reminders/UpcomingReminders';
import { buildDashboard } from '@/modules/health/dashboard';
import { loadReminders } from '@/modules/health/screens';
import { maskDashboard } from '@/modules/health/mask';
import { hasRegionMeasures, toTwinRows } from '@/modules/twin';
import { demoContext } from '@/app/demo/demo-data';
import { isDemoOnly } from '@/lib/demo-mode';

/** Dashboard de demonstração (§40a). CTA "Começar com meus próprios dados" leva ao cadastro (§40b);
 * no modo só demo (ADR-0043), leva ao aviso da demonstração. */
export default async function DemoHomePage() {
  const t = await getTranslations('demo');
  const { range, today, source, hidden } = await demoContext();
  const data = await buildDashboard(source, range, today);
  const reminders = await loadReminders(source);
  const [body, height] = await Promise.all([source.body(range), source.latestHeightCm()]);
  return (
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby="demo-intro"
        className="flex flex-col gap-3 rounded-lg border border-border-strong bg-surface-muted p-4 sm:flex-row sm:items-center"
      >
        <div className="flex-1">
          <h2 id="demo-intro" className="font-semibold">
            {t('introTitle')}
          </h2>
          <p className="text-sm text-fg-muted">{t('introBody')}</p>
        </div>
        {/* Modo só demo (ADR-0043): não há cadastro; o convite vira o aviso da demonstração. */}
        {isDemoOnly() ? (
          <Link href="/demo/sobre" className={buttonClasses('secondary')}>
            {t('aboutLink')}
          </Link>
        ) : (
          <Link href="/cadastro" className={buttonClasses('primary')}>
            {t('startOwn')}
          </Link>
        )}
      </section>
      <Dashboard
        data={hidden ? maskDashboard(data) : data}
        mode="publicDemo"
        hidden={hidden}
        twin={{
          rows: toTwinRows(body),
          latestHeightCm: height,
          hasRegions: hasRegionMeasures(body),
        }}
      />
      <UpcomingReminders
        reminders={reminders.reminders}
        prefs={reminders.prefs}
        habits={reminders.habits}
        now={new Date()}
        manageHref="/demo/habitos"
        demo
      />
      {/* Sem conta: lembrar que viu fica só no navegador (LEG-X02). */}
      <Suspense fallback={null}>
        <Tour autoStart persist="local" />
      </Suspense>
    </div>
  );
}
