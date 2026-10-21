import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/Logo';
import { MAIN_CONTENT_ID, SkipLink } from '@/components/ui/SkipLink';

/** Layout das telas públicas de conta (§52): cartão central, sem navegação do app. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  const t = useTranslations();
  return (
    <>
      <SkipLink />
      <div className="flex min-h-dvh flex-col items-center px-4 py-10">
        <header className="mb-6 text-center">
          <Logo largura={176} rotulo={t('common.appName')} className="mx-auto" />
          <p className="text-sm text-fg-muted">{t('auth.layoutTagline')}</p>
        </header>
        <main
          id={MAIN_CONTENT_ID}
          tabIndex={-1}
          className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-sm outline-none"
        >
          {children}
        </main>
        <footer className="mt-6 max-w-md text-center text-xs text-fg-muted">
          <p>{t('disclaimer.wellbeingOnly')}</p>
        </footer>
      </div>
    </>
  );
}
