import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { OnboardingConsentForm } from '@/components/privacy/OnboardingForms';
import { AVAILABLE_PURPOSES } from '@/modules/consent';
import { requireOnboardingSession } from '@/modules/consent/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('onboarding.consents');
  return { title: t('title') };
}

/** §52 passo 4: consentimentos por finalidade, nunca pré-marcados (LEG-C01–C05). */
export default async function OnboardingConsentsPage() {
  await requireOnboardingSession();
  const t = await getTranslations('onboarding');
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-fg-muted">{t('step', { current: 2, total: 3 })}</p>
      <h1 className="text-2xl font-bold">{t('consents.title')}</h1>
      <p>{t('consents.intro')}</p>
      <OnboardingConsentForm purposes={AVAILABLE_PURPOSES} />
    </div>
  );
}
