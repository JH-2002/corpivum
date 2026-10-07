'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useActionState, useId } from 'react';
import { completeOnboardingAction, resolveUpdateAction } from '@/app/(onboarding)/actions';
import { Checkbox } from '@/components/forms/Checkbox';
import { FormMessage, SubmitButton } from '@/components/forms/FormFields';
import { INITIAL_FORM_STATE } from '@/components/forms/form-state';
import type { AvailablePurpose, RequiredDocument } from '@/modules/consent';
import { PurposeDetails } from './PurposeDetails';

const linkClass = 'font-semibold text-primary underline underline-offset-2';

const DOCUMENT_LINKS: Record<RequiredDocument, '/legal/termos' | '/legal/politica-de-privacidade'> =
  {
    terms: '/legal/termos',
    privacy_policy: '/legal/politica-de-privacidade',
  };

function DocumentLink({ document }: { document: RequiredDocument }) {
  const t = useTranslations('onboarding.consents');
  return (
    <Link href={DOCUMENT_LINKS[document]} target="_blank" rel="noopener" className={linkClass}>
      {document === 'terms' ? t('readTerms') : t('readPrivacy')}
    </Link>
  );
}

/**
 * Escolhas do onboarding (§52 passo 4; LEG-C01–C05). Termos e Política são obrigatórios; cada finalidade
 * é opcional, com o texto completo visível e a caixa desmarcada.
 */
export function OnboardingConsentForm({ purposes }: { purposes: readonly AvailablePurpose[] }) {
  const t = useTranslations('onboarding.consents');
  const tp = useTranslations('consent.purposes');
  const [state, action] = useActionState(completeOnboardingAction, INITIAL_FORM_STATE);
  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <FormMessage state={state} />
      <fieldset className="flex flex-col gap-4 rounded-lg border border-border p-4">
        <legend className="px-1 text-base font-semibold">{t('documentsLegend')}</legend>
        <Checkbox
          name="acceptTerms"
          label={t('termsLabel')}
          description={<DocumentLink document="terms" />}
          error={state.fieldErrors?.acceptTerms}
          required
        />
        <Checkbox
          name="acceptPrivacy"
          label={t('privacyLabel')}
          description={<DocumentLink document="privacy_policy" />}
          error={state.fieldErrors?.acceptPrivacy}
          required
        />
      </fieldset>
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-base font-semibold">{t('purposesLegend')}</legend>
        <p className="text-sm text-fg-muted">{t('optionalNote')}</p>
        {purposes.map((purpose) => (
          <div key={purpose} className="rounded-lg border border-border p-4">
            <Checkbox
              name="purpose"
              value={purpose}
              label={tp(`${purpose}.title`)}
              description={<PurposeDetails purpose={purpose} />}
            />
          </div>
        ))}
      </fieldset>
      <SubmitButton>{t('submit')}</SubmitButton>
    </form>
  );
}

function PurposeDecision({ purpose }: { purpose: AvailablePurpose }) {
  const t = useTranslations('onboarding.update');
  const tp = useTranslations('consent.purposes');
  const id = useId();
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <legend className="px-1 text-base font-semibold">{tp(`${purpose}.title`)}</legend>
      <PurposeDetails purpose={purpose} />
      <div className="flex flex-wrap gap-4">
        {(['keep', 'decline'] as const).map((choice) => (
          <div key={choice} className="flex items-center gap-2">
            {/* Sem opção pré-selecionada: a pessoa escolhe (LEG-C02/C06). */}
            <input
              id={`${id}-${choice}`}
              type="radio"
              name={`decision-${purpose}`}
              value={choice}
              required
              className="size-6 accent-primary"
            />
            <label htmlFor={`${id}-${choice}`} className="font-semibold">
              {t(choice)}
            </label>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

/** Reconsentimento após mudança substancial (LEG-C06): só o que mudou, sem nada pré-selecionado. */
export function UpdateConsentForm({
  documents,
  purposes,
}: {
  documents: readonly RequiredDocument[];
  purposes: readonly AvailablePurpose[];
}) {
  const t = useTranslations('onboarding.update');
  const tl = useTranslations('legal.nav');
  const [state, action] = useActionState(resolveUpdateAction, INITIAL_FORM_STATE);
  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <FormMessage state={state} />
      {documents.map((document) => (
        <div key={document} className="rounded-lg border border-border p-4">
          <p className="mb-2 font-semibold">
            {document === 'terms' ? tl('terms') : tl('privacyPolicy')}
          </p>
          <Checkbox
            name="document"
            value={document}
            label={t('documentAccept')}
            description={<DocumentLink document={document} />}
          />
        </div>
      ))}
      {purposes.map((purpose) => (
        <PurposeDecision key={purpose} purpose={purpose} />
      ))}
      <SubmitButton>{t('submit')}</SubmitButton>
    </form>
  );
}
