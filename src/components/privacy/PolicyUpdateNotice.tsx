import { FileText } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { Route } from 'next';
import { CURRENT_VERSIONS, type RequiredDocument } from '@/modules/consent';
import { AcknowledgeForm } from './AcknowledgeForm';
import { noticeChangeKey } from './policy-notice';

const LABEL_ID = 'policy-update-notice-label';

const DOCUMENT_HREF: Record<RequiredDocument, Route> = {
  terms: '/legal/termos',
  privacy_policy: '/legal/politica-de-privacidade',
};

/**
 * Aviso informativo único de versão nova não substancial (ADR-0031): diz o que mudou, leva ao texto e registra a
 * ciência em "Entendi". Não bloqueia o app. O rótulo é um parágrafo (não um título): o aviso vem antes do `h1`
 * da página. Texto RASCUNHO, `LEGAL-REVIEW` (OI-30).
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
      aria-labelledby={LABEL_ID}
      className="mb-6 flex flex-col gap-3 rounded-lg border border-info bg-info-soft p-4"
    >
      <p id={LABEL_ID} className="flex items-center gap-2 text-base font-semibold">
        <FileText aria-hidden className="size-5" />
        {t('title', { count: documents.length })}
      </p>
      <ul className="flex flex-col gap-2 text-sm">
        {documents.map((document) => {
          const version = CURRENT_VERSIONS[document].version;
          const key = noticeChangeKey(document, version);
          return (
            <li key={document}>
              {key ? t(key as Parameters<typeof t>[0]) : t('changes.generic', { version })}{' '}
              <Link href={DOCUMENT_HREF[document]} className="font-semibold underline">
                {t(`read.${document}`)}
              </Link>
            </li>
          );
        })}
      </ul>
      <AcknowledgeForm
        documents={documents}
        action={action}
        label={t('acknowledge')}
        hint={t('acknowledgeHint')}
      />
    </section>
  );
}
