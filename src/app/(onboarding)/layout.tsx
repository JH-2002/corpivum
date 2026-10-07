import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { MAIN_CONTENT_ID, SkipLink } from '@/components/ui/SkipLink';

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
        <footer className="mt-6 max-w-2xl text-center text-xs text-fg-muted">
          <p>{t('disclaimer.wellbeingOnly')}</p>
        </footer>
      </div>
    </>
  );
}
