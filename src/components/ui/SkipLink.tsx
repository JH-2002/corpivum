import { useTranslations } from 'next-intl';

export const MAIN_CONTENT_ID = 'conteudo-principal';

/** Primeiro elemento focável da página: pula a navegação (WCAG 2.4.1). */
export function SkipLink() {
  const t = useTranslations('common');
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      className="sr-only z-50 rounded-md bg-primary px-4 py-3 font-semibold text-primary-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
    >
      {t('skipToContent')}
    </a>
  );
}
