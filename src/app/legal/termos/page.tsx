import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LegalDocument } from '@/components/privacy/LegalDocument';
import { withRouteMessages } from '@/i18n/RouteMessages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal.terms');
  return { title: t('title') };
}

/** Termos de Uso (§53, LEG-G04). RASCUNHO, `LEGAL-REVIEW` (OI-08). */
function TermsPage() {
  return <LegalDocument doc="terms" />;
}

export default withRouteMessages('legal/termos', TermsPage);
