import { getTranslations } from 'next-intl/server';
import { ViewTransition, type ReactNode } from 'react';
import { PolicyUpdateNotice } from '@/components/privacy/PolicyUpdateNotice';
import { BottomNav } from '@/components/shell/BottomNav';
import { PAGE_TRANSITION } from '@/components/shell/page-transition';
import { Header } from '@/components/shell/Header';
import { QuickLogDialog } from '@/components/shell/QuickLogDialog';
import { ShellProvider } from '@/components/shell/ShellProvider';
import { Sidebar } from '@/components/shell/Sidebar';
import { MAIN_CONTENT_ID, SkipLink } from '@/components/ui/SkipLink';
import { readPeriod } from '@/lib/period-server';
import { readPrivacyMode } from '@/lib/privacy-mode-server';
import { PrivacyModeProvider } from '@/components/privacy-mode/PrivacyModeProvider';
import { requireAppSession } from '@/modules/consent/server';
import { acknowledgePolicyNoticeAction } from './actions';

/**
 * App shell (§7): sidebar (tablet/desktop), header, conteúdo e navegação inferior (mobile).
 * Guarda da área logada: sessão validada no banco a cada requisição e e-mail verificado (LEG-S04), e
 * onboarding concluído (§52). O reconsentimento pendente (LEG-C06) é cobrado em cada página; aqui não, para
 * a Central de Privacidade continuar acessível durante a atualização.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireAppSession({ allowPendingUpdate: true });
  const t = await getTranslations('disclaimer');
  const { period, today } = await readPeriod();
  const privacyMode = await readPrivacyMode();

  return (
    <PrivacyModeProvider initialHidden={privacyMode}>
      <ShellProvider initialPeriod={period} today={today}>
        <SkipLink />
        <div className="flex min-h-dvh">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Modo demo (§52.5, ADR-0021): dados fictícios em memória, sempre com o indicador DEMO. */}
            <Header isDemo={session.dataMode === 'demo'} />
            <main
              id={MAIN_CONTENT_ID}
              tabIndex={-1}
              className="flex-1 px-4 py-6 pb-24 outline-none md:pb-6 lg:px-6"
            >
              <div className="mx-auto w-full max-w-6xl">
                {/* Versão nova não substancial dos Termos ou da Política: aviso único (ADR-0031). */}
                <PolicyUpdateNotice
                  documents={session.documentNotices}
                  action={acknowledgePolicyNoticeAction}
                />
                {/* Troca de página pelo menu com esmaecimento curto (9f, ADR-0055); direta com "Reduzir animações". */}
                <ViewTransition default={PAGE_TRANSITION}>{children}</ViewTransition>
              </div>
            </main>
            <footer className="border-t border-border px-4 pt-4 pb-24 text-xs text-fg-muted md:pb-4 lg:px-6">
              <p className="mx-auto max-w-6xl">{t('wellbeingOnly')}</p>
            </footer>
          </div>
        </div>
        <BottomNav />
        <QuickLogDialog />
      </ShellProvider>
    </PrivacyModeProvider>
  );
}
