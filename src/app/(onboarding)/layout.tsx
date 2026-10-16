import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { MAIN_CONTENT_ID, SkipLink } from '@/components/ui/SkipLink';
import {
  ONBOARDING_EXPIRY_DAYS,
  ONBOARDING_EXPIRY_NOTICE_DAYS,
} from '@/modules/privacy/onboarding-expiry';

/** Layout do onboarding (§52) e do reconsentimento: cartão central, sem a navegação do app. */
export default function OnboardingLayout({ children }: { children: ReactNode }) {
  const t = useTranslations();
  return (
    <>
      <SkipLink />
      <div className="flex min-h-dvh flex-col items-center px-4 py-10">
        <header className="mb-6 text-center">
          <p className="text-xl font-bold">{t('common.appName')}</p>
          <p className="text-sm text-fg-muted">{t('auth.layoutTagline')}</p>
        </header>
        <main
          id={MAIN_CONTENT_ID}
          tabIndex={-1}
          className="w-full max-w-2xl rounded-lg border border-border bg-surface p-6 shadow-sm outline-none"
        >
          {children}
        </main>
        <footer className="mt-6 flex max-w-2xl flex-col gap-3 text-center text-xs text-fg-muted">
          {/* Saída da conta sempre à vista, antes de qualquer aceite (P7-M2, LEG-D04, LEG-F04). */}
          <Link href="/boas-vindas/encerrar-conta" className="text-sm text-fg underline">
            {t('onboarding.exitLink')}
          </Link>
          {/* O prazo das contas sem onboarding à vista desde a primeira tela (revisão da 7b). */}
          <p>
            {t('onboarding.exit.expiry', {
              days: ONBOARDING_EXPIRY_DAYS,
              noticeDays: ONBOARDING_EXPIRY_NOTICE_DAYS,
            })}
          </p>
          <p>{t('disclaimer.wellbeingOnly')}</p>
        </footer>
      </div>
    </>
  );
}
