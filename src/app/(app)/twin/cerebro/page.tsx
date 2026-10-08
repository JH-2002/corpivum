import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { HealthFrame, healthView } from '@/components/health/HealthPage';
import { readPreviewState, type PageSearchParams } from '@/components/shell/ModulePage';
import { TwinBrainView, TwinSections } from '@/components/twin/TwinViews';
import { readPeriod } from '@/lib/period-server';
import { requireAppSession } from '@/modules/consent/server';
import { brainThemes } from '@/modules/insights';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('twin.sections');
  return { title: t('brain') };
}

/**
 * Cérebro 3D educativo (§17, §18, LEG-M05). Os registros de sono, humor e hábitos são lidos com
 * consentimento e resumidos aqui no servidor (`brainThemes`): ao navegador vão só números.
 */
export default async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  // Validação da sessão em cada página: layouts não re-renderizam na navegação do cliente (LEG-S04).
  const session = await requireAppSession();
  const preview = await readPreviewState(searchParams);
  const { range, today } = await readPeriod();
  const view = healthView(session, today);
  const themes =
    view.kind === 'data' && !preview
      ? await view.source.session(async (s) => {
          const [sleep, mood, habits, checks] = await Promise.all([
            s.sleep(range),
            s.mood(range),
            s.habits(),
            s.checks(range),
          ]);
          return brainThemes({ sleep, mood, habits, checks, range });
        })
      : null;
  return (
    <HealthFrame page="twin" href="/twin/cerebro" session={session} view={view} preview={preview}>
      {view.kind === 'data' && themes ? (
        <div className="flex flex-col gap-6">
          <TwinSections base="/twin" current="brain" />
          <TwinBrainView themes={themes} range={range} today={today} mode={view.mode} />
        </div>
      ) : null}
    </HealthFrame>
  );
}
