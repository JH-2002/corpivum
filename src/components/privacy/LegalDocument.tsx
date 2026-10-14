import { getFormatter, getTranslations } from 'next-intl/server';
import { CURRENT_VERSIONS, PUBLISHED_AT } from '@/modules/consent';

/** Rótulo de rascunho obrigatório enquanto não houver revisão jurídica (LEG-G04, `LEGAL-REVIEW`). */
export async function DraftBanner() {
  const t = await getTranslations('disclaimer');
  return (
    <p
      role="note"
      className="rounded-md border border-warning bg-warning-soft p-3 text-sm font-semibold"
    >
      {t('draftLegal')}
    </p>
  );
}

const SECTIONS = {
  privacyPolicy: 9,
  terms: 6,
} as const;

/** Documento versionado (Política ou Termos), com versão e data de publicação. */
export async function LegalDocument({ doc }: { doc: 'privacyPolicy' | 'terms' }) {
  const t = await getTranslations(`legal.${doc}`);
  const tl = await getTranslations('legal');
  const format = await getFormatter();
  const document = doc === 'terms' ? 'terms' : 'privacy_policy';
  const version = CURRENT_VERSIONS[document].version;
  const sections = Array.from({ length: SECTIONS[doc] }, (_, i) => i + 1);
  return (
    <article className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <DraftBanner />
      <p className="text-sm text-fg-muted">
        {tl('version', {
          version,
          date: format.dateTime(new Date(`${PUBLISHED_AT[document]}T12:00:00Z`), {
            dateStyle: 'long',
          }),
        })}
      </p>
      {sections.map((n) => (
        <section key={n} className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">{t(`s${n}Title` as Parameters<typeof t>[0])}</h2>
          <p>{t(`s${n}Body` as Parameters<typeof t>[0])}</p>
        </section>
      ))}
    </article>
  );
}
