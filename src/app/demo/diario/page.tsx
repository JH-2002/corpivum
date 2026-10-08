import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { JournalView } from '@/components/modules/journal/JournalView';
import { readJournalParams } from '@/components/modules/journal/params';
import type { PageSearchParams } from '@/components/shell/ModulePage';
import { demoContext } from '../demo-data';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('journal') };
}

export default async function DemoJournalPage({
  searchParams,
}: {
  searchParams: PageSearchParams;
}) {
  const { range, today, source } = await demoContext();
  const { filter, layout } = await readJournalParams(searchParams);
  const entries = await source.journal(range, { withText: true, filter });
  return (
    <JournalView
      entries={entries}
      today={today}
      mode="publicDemo"
      basePath="/demo/diario"
      layout={layout}
      filter={filter}
    />
  );
}
