import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { EnableMfa } from '@/components/auth/SecurityForms';
import { buttonClasses } from '@/components/ui/Button';
import { getAuthService } from '@/modules/auth/server';
import { requireOnboardingSession } from '@/modules/consent/server';
import { withRouteMessages } from '@/i18n/RouteMessages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('onboarding.security');
  return { title: t('title') };
}

/** §52 passo 3: oferta de MFA, opcional. Segue para as escolhas de privacidade. */
async function OnboardingSecurityPage() {
  const session = await requireOnboardingSession();
  const { mfaEnabled } = await getAuthService().getSecurityOverview(session.userId);
  const t = await getTranslations('onboarding');
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-fg-muted">{t('step', { current: 1, total: 3 })}</p>
      <h1 className="text-2xl font-bold">{t('security.title')}</h1>
      <p>{t('security.body')}</p>
      {mfaEnabled ? null : <EnableMfa />}
      <Link href="/boas-vindas/consentimentos" className={buttonClasses('secondary', 'self-start')}>
        {t('security.continue')}
      </Link>
    </div>
  );
}

export default withRouteMessages('(onboarding)/boas-vindas/seguranca', OnboardingSecurityPage);
