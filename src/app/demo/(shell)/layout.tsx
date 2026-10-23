import { getTranslations } from 'next-intl/server';
import { ViewTransition, type ReactNode } from 'react';
import { BottomNav } from '@/components/shell/BottomNav';
import { Header } from '@/components/shell/Header';
import { QuickLogDialog } from '@/components/shell/QuickLogDialog';
import { ShellProvider } from '@/components/shell/ShellProvider';
import { Sidebar } from '@/components/shell/Sidebar';
import { MAIN_CONTENT_ID, SkipLink } from '@/components/ui/SkipLink';
import { readPeriod } from '@/lib/period-server';
import { readPrivacyMode } from '@/lib/privacy-mode-server';
import { PrivacyModeProvider } from '@/components/privacy-mode/PrivacyModeProvider';

/**
 * Demo público sem login (LEG-X02, §40, ADR-0021). Dados 100% fictícios gerados em memória, selo DEMO em
 * tudo, sem banco, formulários só como exemplo (sem envio, ADR-0047) e sem coleta além dos registros técnicos
 * da hospedagem. Cookies: só as preferências de período e do modo privacidade (sessão, sem identificador;
 * ADR-0021, ADR-0035).
 */
export default async function DemoShellLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('disclaimer');
  const { period, today } = await readPeriod();
  const privacyMode = await readPrivacyMode();
  return (
    <PrivacyModeProvider initialHidden={privacyMode}>
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
              <div className="mx-auto w-full max-w-6xl">
                {/* Troca de página com esmaecimento curto (9f, ADR-0055); direta com "Reduzir animações". */}
                <ViewTransition>{children}</ViewTransition>
              </div>
            </main>
            <footer className="flex flex-col gap-1 border-t border-border px-4 pt-4 pb-24 text-xs text-fg-muted md:pb-4 lg:px-6">
              <p className="mx-auto w-full max-w-6xl">{t('demoData')}</p>
              <p className="mx-auto w-full max-w-6xl">{t('wellbeingOnly')}</p>
            </footer>
          </div>
        </div>
        <BottomNav variant="demo" />
        <QuickLogDialog variant="demo" />
      </ShellProvider>
    </PrivacyModeProvider>
  );
}
