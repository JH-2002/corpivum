import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  ModulePage,
  resolvePreviewState,
  type PageSearchParams,
} from '@/components/shell/ModulePage';
import { ThemeSelector } from '@/components/theme/ThemeSelector';
import { requireAppSession } from '@/modules/consent/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('nav');
  return { title: t('settings') };
}

export default async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  // Validação da sessão em cada página: layouts não re-renderizam na navegação do cliente (LEG-S04).
  await requireAppSession();
  const t = await getTranslations('auth.security');
  return (
    <ModulePage
      page="settings"
      href="/configuracoes"
      state={await resolvePreviewState(searchParams)}
    >
      <div className="flex flex-col gap-6">
        <section className="rounded-lg border border-border bg-surface p-6 shadow-sm">
          <ThemeSelector />
        </section>
        <section className="rounded-lg border border-border bg-surface p-6 shadow-sm">
          <Link
            href="/configuracoes/seguranca"
            className="font-semibold text-primary underline underline-offset-2"
          >
            {t('link')}
          </Link>
          <p className="text-sm text-fg-muted">{t('linkDescription')}</p>
        </section>
      </div>
    </ModulePage>
  );
}
