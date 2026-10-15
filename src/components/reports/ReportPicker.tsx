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
        <label className="flex flex-col gap-1 text-sm">
          {t('kind')}
          <select
            name="tipo"
            defaultValue={period}
            className="min-h-11 rounded-md border border-border-strong bg-surface px-3"
          >
            {REPORT_PERIODS.map((p) => (
              <option key={p} value={p}>
                {t(p)}
              </option>
            ))}
          </select>
        </label>
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
