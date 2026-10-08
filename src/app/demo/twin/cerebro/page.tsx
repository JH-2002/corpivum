import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TwinBrainView, TwinSections } from '@/components/twin/TwinViews';
import { brainThemes } from '@/modules/insights';
import { previousRange } from '@/lib/dates';
import { demoContext } from '../../demo-data';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('twin.sections');
  return { title: t('brain') };
}

/** Cérebro 3D educativo no demo público: só dados fictícios, sem sessão e sem banco (LEG-X02). */
export default async function DemoBrainPage() {
  const { range, today, source } = await demoContext();
  const [sleep, mood, previousMood, habits, checks] = await Promise.all([
    source.sleep(range),
    source.mood(range),
    source.mood(previousRange(range)),
    source.habits(),
    source.checks(range),
  ]);
  const themes = brainThemes({ sleep, mood, previousMood, habits, checks, range });
  return (
    <div className="flex flex-col gap-6">
      <TwinSections base="/demo/twin" current="brain" />
      <TwinBrainView themes={themes} range={range} today={today} mode="publicDemo" />
    </div>
  );
}
