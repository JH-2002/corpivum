import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { BottomNav } from '@/components/shell/BottomNav';
import { Header } from '@/components/shell/Header';
import { QuickLogDialog } from '@/components/shell/QuickLogDialog';
import { ShellProvider } from '@/components/shell/ShellProvider';
import { Sidebar } from '@/components/shell/Sidebar';
import { MAIN_CONTENT_ID, SkipLink } from '@/components/ui/SkipLink';
import { requireVerifiedSession } from '@/modules/auth/server';

/**
 * App shell (§7): sidebar (tablet/desktop), header, conteúdo e navegação inferior (mobile).
 * Guarda da área logada: sessão validada no banco a cada requisição e e-mail verificado (LEG-S04).
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireVerifiedSession();
  const t = await getTranslations('disclaimer');

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
