import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { HealthFrame, healthView } from '@/components/health/HealthPage';
import { NutritionView } from '@/components/modules/nutrition/NutritionView';
import { readPreviewState, type PageSearchParams } from '@/components/shell/ModulePage';
import { readPeriod } from '@/lib/period-server';
import { requireAppSession } from '@/modules/consent/server';
import { maskNutritionScreen } from '@/modules/health/mask';
import { loadNutrition } from '@/modules/health/screens';
import { readPrivacyMode } from '@/lib/privacy-mode-server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('nutrition') };
}

export default async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  // Validação da sessão em cada página: layouts não re-renderizam na navegação do cliente (LEG-S04).
  const session = await requireAppSession();
  const preview = await readPreviewState(searchParams);
  const { range, today } = await readPeriod();
  const view = healthView(session, today);
  const hidden = await readPrivacyMode();
  const loaded =
    view.kind === 'data' && !preview ? await loadNutrition(view.source, range, today) : null;
  const data = loaded && hidden ? maskNutritionScreen(loaded) : loaded;
  return (
    <HealthFrame
      page="nutrition"
      href="/alimentacao"
      session={session}
      view={view}
      preview={preview}
    >
      {view.kind === 'data' && data ? (
        <NutritionView {...data} range={range} today={today} mode={view.mode} hidden={hidden} />
      ) : null}
    </HealthFrame>
  );
}
