import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { LegalDocument } from '@/components/privacy/LegalDocument';
import { withRouteMessages } from '@/i18n/RouteMessages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal.privacyPolicy');
  return { title: t('title') };
}

/** Política de Privacidade (§53, LEG-G04). RASCUNHO, `LEGAL-REVIEW` (OI-08). */
function PrivacyPolicyPage() {
  return <LegalDocument doc="privacyPolicy" />;
}

export default withRouteMessages('legal/politica-de-privacidade', PrivacyPolicyPage);
