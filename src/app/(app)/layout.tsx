import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { BottomNav } from '@/components/shell/BottomNav';
import { Header } from '@/components/shell/Header';
import { QuickLogDialog } from '@/components/shell/QuickLogDialog';
import { ShellProvider } from '@/components/shell/ShellProvider';
import { Sidebar } from '@/components/shell/Sidebar';
import { MAIN_CONTENT_ID, SkipLink } from '@/components/ui/SkipLink';

/** App shell (§7): sidebar (tablet/desktop), header, conteúdo e navegação inferior (mobile). */
export default function AppLayout({ children }: { children: ReactNode }) {
  const t = useTranslations('disclaimer');

  return (
    <ShellProvider>
      <SkipLink />
      <div className="flex min-h-dvh">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Modo demo entra na Fase 2; o indicador já está pronto no Header. */}
          <Header isDemo={false} />
          <main
            id={MAIN_CONTENT_ID}
            tabIndex={-1}
            className="flex-1 px-4 py-6 pb-24 outline-none md:pb-6 lg:px-6"
          >
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          </main>
          <footer className="border-t border-border px-4 pt-4 pb-24 text-xs text-fg-muted md:pb-4 lg:px-6">
            <p className="mx-auto max-w-6xl">{t('wellbeingOnly')}</p>
          </footer>
        </div>
      </div>
      <BottomNav />
      <QuickLogDialog />
    </ShellProvider>
  );
}
