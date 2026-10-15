import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { HealthFrame, healthView } from '@/components/health/HealthPage';
import { TimelineView } from '@/components/modules/timeline/TimelineView';
import { readPreviewState, type PageSearchParams } from '@/components/shell/ModulePage';
import { readPeriod } from '@/lib/period-server';
import { requireAppSession } from '@/modules/consent/server';
import { maskTimeline } from '@/modules/health/mask';
import { loadTimeline } from '@/modules/health/screens';
import { readPrivacyMode } from '@/lib/privacy-mode-server';
import { buildTimeline, parseTimelineDomain } from '@/modules/timeline';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('timeline') };
}

export default async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  // Validação da sessão em cada página: layouts não re-renderizam na navegação do cliente (LEG-S04).
  const session = await requireAppSession();
  const preview = await readPreviewState(searchParams);
  const domain = parseTimelineDomain((await searchParams).dominio);
  const { range, today } = await readPeriod();
  const view = healthView(session, today);
  const hidden = await readPrivacyMode();
  const data = view.kind === 'data' && !preview ? await loadTimeline(view.source, range) : null;
  const days = data ? buildTimeline({ ...data, range, today, domain }) : [];
  return (
    <HealthFrame page="timeline" href="/timeline" session={session} view={view} preview={preview}>
      {view.kind === 'data' && data ? (
        <TimelineView
          days={hidden ? maskTimeline(days) : days}
          domain={domain}
          basePath="/timeline"
          range={range}
          today={today}
          mode={view.mode}
          hidden={hidden}
        />
      ) : null}
    </HealthFrame>
  );
}
