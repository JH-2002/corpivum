'use client';

import { CalendarRange } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import {
  formatIsoDate,
  PERIOD_PRESETS,
  resolveRange,
  validateCustomRange,
  type CustomRangeError,
  type Period,
  type PeriodPreset,
} from '@/lib/period';
import { useShell } from './ShellProvider';

type Option = PeriodPreset | 'custom';
const OPTIONS: readonly Option[] = [...PERIOD_PRESETS, 'custom'];

/**
 * Seletor de período global (§10): 7/30/90 dias, 12 meses ou personalizado.
 * Sempre mostra o intervalo de datas em texto. A escolha persiste durante a sessão (cookie, ADR-0021).
 */
export function PeriodSelector() {
  const t = useTranslations('period');
  const { period, setPeriod, today } = useShell();
  const ids = { select: useId(), from: useId(), to: useId(), error: useId() };

  // Seleção "personalizado" ainda não aplicada (o período global só muda ao clicar em Aplicar).
  const [draftCustom, setDraftCustom] = useState(false);
  const [error, setError] = useState<CustomRangeError | null>(null);
  const showCustom = draftCustom || period.preset === 'custom';
  const range = today ? resolveRange(period, today) : null;

  function onSelect(value: Option) {
    setError(null);
    if (value === 'custom') {
      setDraftCustom(true);
      return;
    }
    setDraftCustom(false);
    setPeriod({ preset: value });
  }

  function onApply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!today) return;
    const data = new FormData(event.currentTarget);
    const from = String(data.get('from') ?? '');
    const to = String(data.get('to') ?? '');
    const invalid = validateCustomRange(from, to, today);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setDraftCustom(false);
    const next: Period = { preset: 'custom', from, to };
    setPeriod(next);
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <label htmlFor={ids.select} className="flex items-center gap-1.5 text-sm font-semibold">
          <CalendarRange className="size-4 text-fg-muted" aria-hidden="true" />
          {t('label')}
        </label>
        <select
          id={ids.select}
          value={showCustom ? 'custom' : period.preset}
          onChange={(event) => onSelect(event.target.value as Option)}
          className="min-h-11 rounded-md border border-border-strong bg-surface px-3 text-sm"
        >
          {OPTIONS.map((option) => (
            <option key={option} value={option}>
              {t(option)}
            </option>
          ))}
        </select>
        <p aria-live="polite" className="tabular text-sm text-fg-muted">
          {range ? (
            <>
              <span className="sr-only">
                {t('currentRange', {
                  from: formatIsoDate(range.from),
                  to: formatIsoDate(range.to),
                })}
              </span>
              <span aria-hidden="true">
                {t('range', { from: formatIsoDate(range.from), to: formatIsoDate(range.to) })}
              </span>
            </>
          ) : null}
        </p>
      </div>

      {showCustom ? (
        <form onSubmit={onApply} noValidate className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.from} className="text-xs font-semibold">
              {t('from')}
            </label>
            <input
              id={ids.from}
              name="from"
              type="date"
              required
              max={today ?? undefined}
              defaultValue={period.preset === 'custom' ? period.from : range?.from}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? ids.error : undefined}
              className="min-h-11 rounded-md border border-border-strong bg-surface px-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.to} className="text-xs font-semibold">
              {t('to')}
            </label>
            <input
              id={ids.to}
              name="to"
              type="date"
              required
              max={today ?? undefined}
              defaultValue={period.preset === 'custom' ? period.to : range?.to}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? ids.error : undefined}
              className="min-h-11 rounded-md border border-border-strong bg-surface px-2 text-sm"
            />
          </div>
          <Button type="submit" variant="secondary">
            {t('apply')}
          </Button>
          {error ? (
            <p id={ids.error} role="alert" className="basis-full text-sm text-danger">
              {error === 'too_long' ? t('tooLong') : t('invalidRange')}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
