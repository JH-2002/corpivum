import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { MinorClosureDialog } from '@/components/privacy/PrivacyDialogs';
import { AccountDeletionDialog } from '@/components/privacy/RightsForms';
import { getEnv } from '@/lib/env';
import { getAuthService } from '@/modules/auth/server';
import { requireOnboardingExitSession } from '@/modules/consent/server';
import {
  ONBOARDING_EXPIRY_DAYS,
  ONBOARDING_EXPIRY_NOTICE_DAYS,
} from '@/modules/privacy/onboarding-expiry';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('onboarding.exit');
  return { title: t('title') };
}

/**
 * Saída da conta antes de concluir o onboarding (P7-M2, ADR-0037; LEG-D04, LEG-F04). Exige só o e-mail
 * confirmado: excluir a conta ou encerrá-la por ser menor de 18 nunca depende de aceitar os Termos nem de
 * fazer as escolhas de consentimento. Mesmas confirmações da Central (senha, 2º fator se ligado, frase).
 */
export default async function OnboardingExitPage() {
  const session = await requireOnboardingExitSession();
  const { mfaEnabled } = await getAuthService().getSecurityOverview(session.userId);
  const env = getEnv();
  const t = await getTranslations('onboarding.exit');
  const tp = await getTranslations('privacyCenter');
  const retention = {
    proofDays: env.PROOF_RETENTION_DAYS,
    accessDays: env.ACCESS_LOG_RETENTION_DAYS,
    backupDays: env.BACKUP_RETENTION_DAYS,
  };
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p>{t('intro')}</p>
        <p className="text-sm text-fg-muted">
          {t('expiry', { days: ONBOARDING_EXPIRY_DAYS, noticeDays: ONBOARDING_EXPIRY_NOTICE_DAYS })}
        </p>
      </div>

      <section aria-labelledby="sair-excluir" className="flex flex-col gap-3">
        <h2 id="sair-excluir" className="text-lg font-semibold">
          {tp('deletion.title')}
        </h2>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
          <li>{tp('deletion.what.now')}</li>
          <li>{t('erased')}</li>
          <li>{tp('deletion.what.proofs', { days: retention.proofDays })}</li>
          <li>{tp('deletion.what.access', { days: retention.accessDays })}</li>
          <li>{tp('deletion.what.backups', { days: retention.backupDays })}</li>
          <li>{tp('deletion.what.final')}</li>
        </ul>
        <div>
          <AccountDeletionDialog
            mfaEnabled={mfaEnabled}
            hasExport={false}
            retention={retention}
            fromOnboarding
          />
        </div>
      </section>

      <section aria-labelledby="sair-menor" className="flex flex-col gap-3">
        <h2 id="sair-menor" className="text-lg font-semibold">
          {tp('minorTitle')}
        </h2>
        <p className="text-sm">{tp('minorDescription')}</p>
        <div>
          <MinorClosureDialog retention={retention} mfaEnabled={mfaEnabled} fromOnboarding />
        </div>
      </section>

      <Link
        href="/boas-vindas/seguranca"
        className="self-start font-semibold text-primary underline"
      >
        {t('back')}
      </Link>
    </div>
  );
}
