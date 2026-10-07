'use server';

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import type { FormState } from '@/components/forms/form-state';
import { requireVerifiedSession } from '@/modules/auth/server';
import { AVAILABLE_PURPOSES, REQUIRED_DOCUMENTS } from '@/modules/consent';
import { getConsentService } from '@/modules/consent/server';

/**
 * Onboarding §52 e reconsentimento (LEG-C01–C06). Toda action revalida a sessão no banco e toda entrada
 * passa por Zod. Nada vem marcado por padrão: só conta o que a pessoa marcou no formulário.
 */
const checked = z.literal('on').optional();
const onboardingSchema = z.object({
  acceptTerms: checked,
  acceptPrivacy: checked,
  purposes: z.array(z.enum(AVAILABLE_PURPOSES)).max(AVAILABLE_PURPOSES.length),
});

export async function completeOnboardingAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const session = await requireVerifiedSession();
  const t = await getTranslations('onboarding.consents');
  const parsed = onboardingSchema.safeParse({
    acceptTerms: form.get('acceptTerms') ?? undefined,
    acceptPrivacy: form.get('acceptPrivacy') ?? undefined,
    purposes: form.getAll('purpose'),
  });
  if (!parsed.success) return { status: 'error', message: t('termsRequired') };
  const { acceptTerms, acceptPrivacy, purposes } = parsed.data;
  if (!acceptTerms || !acceptPrivacy) {
    return {
      status: 'error',
      fieldErrors: {
        ...(acceptTerms ? {} : { acceptTerms: t('termsRequired') }),
        ...(acceptPrivacy ? {} : { acceptPrivacy: t('privacyRequired') }),
      },
    };
  }
  await getConsentService().completeOnboarding(session.userId, {
    acceptTerms: true,
    acceptPrivacy: true,
    purposes,
  });
  redirect('/inicio');
}

const updateSchema = z.object({
  documents: z.array(z.enum(REQUIRED_DOCUMENTS)).max(REQUIRED_DOCUMENTS.length),
  decisions: z.partialRecord(z.enum(AVAILABLE_PURPOSES), z.enum(['keep', 'decline'])),
});

export async function resolveUpdateAction(_prev: FormState, form: FormData): Promise<FormState> {
  const session = await requireVerifiedSession();
  const t = await getTranslations('onboarding.update');
  const decisions: Record<string, FormDataEntryValue> = {};
  for (const purpose of AVAILABLE_PURPOSES) {
    const value = form.get(`decision-${purpose}`);
    if (value !== null) decisions[purpose] = value;
  }
  const parsed = updateSchema.safeParse({ documents: form.getAll('document'), decisions });
  if (!parsed.success) return { status: 'error', message: t('choiceRequired') };
  const result = await getConsentService().resolveUpdate(session.userId, {
    acceptDocuments: parsed.data.documents,
    decisions: parsed.data.decisions,
  });
  if (!result.ok) {
    return {
      status: 'error',
      message: result.error === 'documents_required' ? t('documentRequired') : t('choiceRequired'),
    };
  }
  redirect('/inicio');
}
