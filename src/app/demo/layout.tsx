import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { BottomNav } from '@/components/shell/BottomNav';
import { Header } from '@/components/shell/Header';
import { ShellProvider } from '@/components/shell/ShellProvider';
import { Sidebar } from '@/components/shell/Sidebar';
import { MAIN_CONTENT_ID, SkipLink } from '@/components/ui/SkipLink';
import { readPeriod } from '@/lib/period-server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('demo');
  // Demonstração pública: não indexar (dados fictícios, sem valor de busca).
  return {
    title: { template: `%s · ${t('title')}`, default: t('title') },
    robots: { index: false },
  };
}

/**
 * Demo público sem login (LEG-X02, §40, ADR-0021). Dados 100% fictícios gerados em memória, selo DEMO em
 * tudo, sem banco, sem formulários e sem coleta além dos registros técnicos da hospedagem. O único cookie
 * é a preferência de período (sessão, sem identificador).
 */
export default async function DemoLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('disclaimer');
  const { period, today } = await readPeriod();
  return (
    <ShellProvider initialPeriod={period} today={today}>
      <SkipLink />
      <div className="flex min-h-dvh">
        <Sidebar variant="demo" />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header isDemo variant="demo" />
          <main
            id={MAIN_CONTENT_ID}
            tabIndex={-1}
            className="flex-1 px-4 py-6 pb-24 outline-none md:pb-6 lg:px-6"
          >
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          </main>
          <footer className="flex flex-col gap-1 border-t border-border px-4 pt-4 pb-24 text-xs text-fg-muted md:pb-4 lg:px-6">
            <p className="mx-auto w-full max-w-6xl">{t('demoData')}</p>
            <p className="mx-auto w-full max-w-6xl">{t('wellbeingOnly')}</p>
          </footer>
        </div>
      </div>
      <BottomNav variant="demo" />
    </ShellProvider>
  );
}
