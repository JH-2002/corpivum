import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { buttonClasses } from '@/components/ui/Button';
import { REPORT_PERIODS, type ReportPeriod } from '@/modules/reports';

/**
 * Escolha do relatório (semana, mês ou ano civil e uma data dentro dele). Formulário GET: funciona sem
 * JavaScript e o endereço pode ser guardado. A validação é no servidor (data real, até hoje).
 */
export function ReportPicker({
  period,
  reference,
  today,
  invalid,
}: {
  period: ReportPeriod;
  reference: string;
  today: string;
  invalid: boolean;
}) {
  const t = useTranslations('reports.picker');
  return (
    <form
      method="get"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <fieldset className="flex flex-wrap items-end gap-4">
        <legend className="mb-2 text-sm font-medium">{t('legend')}</legend>
        {/* Três opções à vista, no estilo do seletor de período (9d0): rádios nativos, sem o `<select>` do sistema
            e sem depender de JavaScript. */}
        <fieldset className="m-0 flex flex-col gap-1 border-0 p-0 text-sm">
          <legend className="mb-1">{t('kind')}</legend>
          <div className="flex flex-wrap gap-1 rounded-md border border-border-strong p-1">
            {REPORT_PERIODS.map((p) => (
              <label
                key={p}
                className="rounded relative inline-flex min-h-11 cursor-pointer items-center gap-1.5 px-3 text-fg-muted hover:bg-surface-muted hover:text-fg has-[:checked]:bg-primary has-[:checked]:font-semibold has-[:checked]:text-primary-fg has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus"
              >
                <input
                  type="radio"
                  name="tipo"
                  value={p}
                  defaultChecked={p === period}
                  className="peer sr-only"
                />
                <Check className="hidden size-4 shrink-0 peer-checked:block" aria-hidden="true" />
                {t(p)}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex flex-col gap-1 text-sm">
          {t('reference')}
          <input
            type="date"
            name="ref"
            defaultValue={reference}
            max={today}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? 'report-ref-error' : undefined}
            className="min-h-11 rounded-md border border-border-strong bg-surface px-3"
          />
        </label>
        <button type="submit" className={buttonClasses('secondary')}>
          {t('apply')}
        </button>
      </fieldset>
      {invalid ? (
        <p id="report-ref-error" role="alert" className="text-sm text-danger">
          {t('invalid')}
        </p>
      ) : null}
    </form>
  );
}
