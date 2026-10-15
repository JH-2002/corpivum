'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { requestExportAction } from '@/app/(app)/relatorios/actions';
import { FormMessage, SubmitButton } from '@/components/forms/FormFields';
import { INITIAL_FORM_STATE } from '@/components/forms/form-state';

const FORMAT_CLASS =
  'flex min-h-11 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm has-[:checked]:border-primary';

/**
 * Pedido do arquivo do relatório em tela (§29): formato e valores do corpo mostrados ou ocultos. A escolha
 * começa no estado do modo privacidade (ADR-0035); é preferência de exibição, não consentimento, por isso
 * pode vir marcada (a regra de nunca pré-marcar vale para as caixas de consentimento, LEG-C02).
 */
export function ReportFileForm({
  period,
  reference,
  hideBodyDefault,
}: {
  period: string;
  reference: string;
  hideBodyDefault: boolean;
}) {
  const t = useTranslations('reports.generate');
  const [state, action] = useActionState(requestExportAction, INITIAL_FORM_STATE);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="kind" value="report" />
      <input type="hidden" name="period" value={period} />
      <input type="hidden" name="reference" value={reference} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t('format')}</legend>
        <div className="flex flex-wrap gap-2">
          {(['pdf', 'csv', 'json'] as const).map((f, i) => (
            <label key={f} className={FORMAT_CLASS}>
              <input
                type="radio"
                name="format"
                value={f}
                defaultChecked={i === 0}
                className="size-5 accent-primary"
              />
              {t(f)}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t('bodyValues')}</legend>
        <div className="flex flex-wrap gap-2">
          {(['off', 'on'] as const).map((v) => (
            <label key={v} className={FORMAT_CLASS}>
              <input
                type="radio"
                name="hideBodyValues"
                value={v}
                defaultChecked={(v === 'on') === hideBodyDefault}
                className="size-5 accent-primary"
              />
              {t(v === 'on' ? 'hideBody' : 'showBody')}
            </label>
          ))}
        </div>
      </fieldset>
      <FormMessage state={state} />
      <div>
        <SubmitButton variant="primary">{t('submit')}</SubmitButton>
      </div>
    </form>
  );
}

/** Exportação completa (portabilidade, LEG-D03), na Central de Privacidade e antes de revogar ou excluir. */
export function FullExportForm() {
  const t = useTranslations('reports.generate');
  const [state, action] = useActionState(requestExportAction, INITIAL_FORM_STATE);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="kind" value="full_export" />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t('format')}</legend>
        <div className="flex flex-wrap gap-2">
          {(['json', 'csv'] as const).map((f, i) => (
            <label key={f} className={FORMAT_CLASS}>
              <input
                type="radio"
                name="format"
                value={f}
                defaultChecked={i === 0}
                className="size-5 accent-primary"
              />
              {t(f)}
            </label>
          ))}
        </div>
      </fieldset>
      <FormMessage state={state} />
      <div>
        <SubmitButton variant="primary">{t('submit')}</SubmitButton>
      </div>
    </form>
  );
}
