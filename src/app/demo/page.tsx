import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { Tour } from '@/components/tour/Tour';
import { buttonClasses } from '@/components/ui/Button';
import { buildDashboard } from '@/modules/health/dashboard';
import { demoContext } from './demo-data';

/** Dashboard de demonstração (§40a). CTA "Começar com meus próprios dados" leva ao cadastro (§40b). */
export default async function DemoHomePage() {
  const t = await getTranslations('demo');
  const { range, today, source } = await demoContext();
  const data = await buildDashboard(source, range, today);
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
        <Link href="/cadastro" className={buttonClasses('primary')}>
          {t('startOwn')}
        </Link>
      </section>
      <Dashboard data={data} mode="publicDemo" />
      {/* Sem conta: lembrar que viu fica só no navegador (LEG-X02). */}
      <Suspense fallback={null}>
        <Tour autoStart persist="local" />
      </Suspense>
    </div>
  );
}
