import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { MAIN_CONTENT_ID, SkipLink } from '@/components/ui/SkipLink';

const LINKS = [
  { href: '/legal/politica-de-privacidade', key: 'privacyPolicy' },
  { href: '/legal/termos', key: 'terms' },
  { href: '/legal/subprocessadores', key: 'subprocessors' },
  { href: '/legal/encarregado', key: 'dpo' },
] as const;

/** Páginas públicas de conteúdo jurídico (§53, LEG-G04, LEG-D06): sem login e sem coleta. */
export default function LegalLayout({ children }: { children: ReactNode }) {
  const t = useTranslations();
  return (
    <>
      <SkipLink />
      <div className="flex min-h-dvh flex-col items-center px-4 py-10">
        <header className="mb-6 flex w-full max-w-3xl flex-col gap-3">
          <p className="text-xl font-bold">{t('common.appName')}</p>
          <nav aria-label={t('legal.nav.label')}>
            <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
              {LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="font-semibold text-primary underline underline-offset-2"
                  >
                    {t(`legal.nav.${link.key}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </header>
        <main
          id={MAIN_CONTENT_ID}
          tabIndex={-1}
          className="w-full max-w-3xl rounded-lg border border-border bg-surface p-6 shadow-sm outline-none"
        >
          {children}
        </main>
        <footer className="mt-6 max-w-3xl text-center text-xs text-fg-muted">
          <p>{t('disclaimer.wellbeingOnly')}</p>
        </footer>
      </div>
    </>
  );
}
