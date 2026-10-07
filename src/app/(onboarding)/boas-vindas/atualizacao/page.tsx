import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { UpdateConsentForm } from '@/components/privacy/OnboardingForms';
import { requireUpdateSession } from '@/modules/consent/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('onboarding.update');
  return { title: t('title') };
}

/** Reconsentimento (LEG-C06): versão substancial nova pede nova escolha antes de continuar. */
export default async function ConsentUpdatePage() {
  const { state } = await requireUpdateSession();
  const t = await getTranslations('onboarding.update');
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p>{t('intro')}</p>
      <UpdateConsentForm
        documents={state.documents.filter((d) => d.needsAcceptance).map((d) => d.document)}
        purposes={state.purposes.filter((p) => p.needsReconsent).map((p) => p.purpose)}
      />
      <p className="text-sm">
        <Link
          href="/privacidade"
          className="font-semibold text-primary underline underline-offset-2"
        >
          {t('privacyCenter')}
        </Link>
      </p>
    </div>
  );
}
