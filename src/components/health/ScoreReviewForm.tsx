'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { requestScoreReviewAction } from '@/app/(app)/inicio/actions';
import { FormMessage, SubmitButton } from '@/components/forms/FormFields';
import { INITIAL_FORM_STATE } from '@/components/forms/form-state';

/** "Pedir revisão" do Índice (LEG-D08): abre um pedido do titular, com prazo exibido na resposta. */
export function ScoreReviewForm({ version }: { version: number }) {
  const t = useTranslations('wellbeing.review');
  const [state, action] = useActionState(requestScoreReviewAction, INITIAL_FORM_STATE);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="version" value={version} />
      <p className="text-sm text-fg-muted">{t('explain')}</p>
      <FormMessage state={state} />
      {state.status === 'success' ? null : (
        <SubmitButton variant="secondary" className="self-start">
          {t('cta')}
        </SubmitButton>
      )}
    </form>
  );
}
