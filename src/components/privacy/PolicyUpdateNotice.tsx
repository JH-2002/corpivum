import { FileText } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { Route } from 'next';
import { buttonClasses } from '@/components/ui/Button';
import { CURRENT_VERSIONS, type RequiredDocument } from '@/modules/consent';

const TITLE_ID = 'policy-update-notice-title';

const DOCUMENT_HREF: Record<RequiredDocument, Route> = {
  terms: '/legal/termos',
  privacy_policy: '/legal/politica-de-privacidade',
};

/**
 * Aviso informativo único de versão nova não substancial (ADR-0031): diz o que mudou, leva ao texto e registra a
 * ciência em "Entendi". Não bloqueia o app. Texto RASCUNHO, `LEGAL-REVIEW` (OI-30).
 */
export async function PolicyUpdateNotice({
  documents,
  action,
}: {
  documents: readonly RequiredDocument[];
  action: (form: FormData) => Promise<void>;
}) {
  if (documents.length === 0) return null;
  const t = await getTranslations('policyNotice');
  return (
    <section
      aria-labelledby={TITLE_ID}
      className="mb-6 flex flex-col gap-3 rounded-lg border border-info bg-info-soft p-4"
    >
      <h2 id={TITLE_ID} className="flex items-center gap-2 text-base font-semibold">
        <FileText aria-hidden className="size-5" />
        {t('title')}
      </h2>
      <ul className="flex flex-col gap-2 text-sm">
        {documents.map((document) => (
          <li key={document}>
            {t(`changes.${document}`, { version: CURRENT_VERSIONS[document].version })}{' '}
            <Link href={DOCUMENT_HREF[document]} className="font-semibold underline">
              {t(`read.${document}`)}
            </Link>
          </li>
        ))}
      </ul>
      <form action={action} className="flex flex-wrap items-center gap-3">
        {documents.map((document) => (
          <input key={document} type="hidden" name="document" value={document} />
        ))}
        <button type="submit" className={buttonClasses('secondary')}>
          {t('acknowledge')}
        </button>
        <p className="text-xs text-fg-muted">{t('acknowledgeHint')}</p>
      </form>
    </section>
  );
}
