'use client';

import { CalendarRange, Check, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { lastInputWasPointer } from '@/components/ui/programmatic-focus';
import { cn } from '@/lib/cn';
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
 * Seletor de período global (§10): 7/30/90 dias, 12 meses ou personalizado. Botões segmentados no estilo do
 * app (9b), feitos de rádios nativos (setas trocam a opção, nome acessível pelo rótulo); no celular, num menu.
 * Sempre mostra o intervalo de datas em texto. A escolha persiste durante a sessão (cookie, ADR-0021).
 */
export function PeriodSelector() {
  const t = useTranslations('period');
  const { period, setPeriod, today } = useShell();
  const ids = { label: useId(), options: useId(), from: useId(), to: useId(), error: useId() };
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Seleção "personalizado" ainda não aplicada (o período global só muda ao clicar em Aplicar).
  const [draftCustom, setDraftCustom] = useState(false);
  const [error, setError] = useState<CustomRangeError | null>(null);
  const showCustom = draftCustom || period.preset === 'custom';
  const range = today ? resolveRange(period, today) : null;

  // Menu do celular: fecha com Esc (foco volta ao botão), clique fora ou foco saindo dele. As setas trocam a
  // opção sem fechar; só o clique ou toque numa opção fecha.
  useEffect(() => {
    if (!menuOpen) return;
    const root = rootRef.current;
    const onPointerDown = (event: PointerEvent) => {
      if (!root?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      root?.querySelector<HTMLButtonElement>('button[aria-expanded]')?.focus();
    };
    const onFocusOut = (event: FocusEvent) => {
      if (!root?.contains(event.relatedTarget as Node | null)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    root?.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      root?.removeEventListener('focusout', onFocusOut);
    };
  }, [menuOpen]);

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

  const current: Option = showCustom ? 'custom' : period.preset;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <span id={ids.label} className="flex items-center gap-1.5 text-sm font-semibold">
          <CalendarRange className="size-4 text-fg-muted" aria-hidden="true" />
          {t('label')}
        </span>
        <div ref={rootRef} className="relative">
          {/* Celular (< 640px): as opções viram um menu suspenso para caber em 320px (9b). */}
          <button
            type="button"
            aria-expanded={menuOpen}
            aria-controls={ids.options}
            aria-label={t('menuLabel', { current: t(current) })}
            onClick={() => setMenuOpen((v) => !v)}
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border-strong bg-surface px-3 text-sm font-semibold hover:bg-surface-muted sm:hidden"
          >
            {t(current)}
            <ChevronDown
              className={cn('size-4 transition-transform', menuOpen && 'rotate-180')}
              aria-hidden="true"
            />
          </button>
          <div
            id={ids.options}
            role="radiogroup"
            aria-labelledby={ids.label}
            className={cn(
              'z-40 flex-col gap-1 rounded-lg border border-border bg-surface p-1 shadow-lg',
              'max-sm:absolute max-sm:left-0 max-sm:mt-2 max-sm:w-48',
              'sm:flex sm:flex-row sm:rounded-md sm:border-border-strong sm:shadow-none',
              menuOpen ? 'flex' : 'hidden',
            )}
          >
            {OPTIONS.map((option) => (
              <label
                key={option}
                className={cn(
                  'rounded relative flex min-h-11 cursor-pointer items-center gap-1.5 px-3 text-sm',
                  'has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
                  option === current
                    ? 'bg-primary font-semibold text-primary-fg'
                    : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
                )}
              >
                <input
                  type="radio"
                  name={ids.options}
                  value={option}
                  checked={option === current}
                  onChange={() => {
                    onSelect(option);
                    if (lastInputWasPointer()) setMenuOpen(false);
                  }}
                  className="sr-only"
                />
                {/* Ativo: preenchimento + ícone de check + peso da fonte (a cor nunca é o único canal). */}
                <Check
                  className={cn(
                    'size-4 shrink-0',
                    option !== current && 'max-sm:invisible sm:hidden',
                  )}
                  aria-hidden="true"
                />
                {t(option)}
              </label>
            ))}
          </div>
        </div>
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
