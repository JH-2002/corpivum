'use client';

import { Check, Circle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { setHabitCheckAction } from '@/app/(app)/habitos/actions';
import { cn } from '@/lib/cn';

function Toggle({ done, name, date }: { done: boolean; name: string; date?: string }) {
  const t = useTranslations('habits');
  const { pending } = useFormStatus();
  // O "pulo" do ícone só depois do clique desta pessoa, nunca ao carregar a página (9f, ADR-0055).
  const [clicked, setClicked] = useState(false);
  const label =
    date !== undefined
      ? t(done ? 'uncheckDayLabel' : 'checkDayLabel', { name, date })
      : t(done ? 'uncheckLabel' : 'checkLabel', { name });
  return (
    <button
      type="submit"
      disabled={pending}
      aria-pressed={done}
      aria-label={label}
      onClick={() => setClicked(true)}
      className={cn(
        'hm-hover hm-press inline-flex items-center rounded-md border text-sm font-semibold',
        date !== undefined ? 'size-8 justify-center sm:size-10' : 'min-h-11 gap-2 px-3',
        done
          ? 'border-success bg-success-soft text-success'
          : 'border-border-strong bg-surface text-fg hover:bg-surface-muted',
      )}
    >
      {done ? (
        <Check className={cn('size-4', clicked && 'hm-pop')} aria-hidden="true" />
      ) : (
        <Circle className="size-4" aria-hidden="true" />
      )}
      {date !== undefined ? null : done ? t('done') : t('markDone')}
    </button>
  );
}

/**
 * Check rápido do hábito no dia (§11.5, §22). `readOnly` (demo): só mostra o estado, sem gravar.
 * `date` (grade dos últimos 7 dias): botão quadrado só com o ícone, com a data no nome acessível.
 */
export function HabitCheckButton({
  habitId,
  name,
  day,
  done,
  readOnly = false,
  date,
}: {
  habitId: string;
  name: string;
  day: string;
  done: boolean;
  readOnly?: boolean;
  /** Data por extenso (e "não previsto", se for o caso), para a grade compacta. */
  date?: string;
}) {
  const t = useTranslations('habits');
  if (readOnly && date !== undefined) {
    return (
      <span className="inline-flex size-8 items-center justify-center sm:size-10">
        {done ? (
          <Check className="size-4 text-success" aria-hidden="true" />
        ) : (
          <Circle className="size-4 text-fg-muted" aria-hidden="true" />
        )}
        <span className="sr-only">
          {t('dayState', { name, date, state: done ? t('done') : t('notDone') })}
        </span>
      </span>
    );
  }
  if (readOnly) {
    return (
      <span className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold">
        {done ? (
          <Check className="size-4 text-success" aria-hidden="true" />
        ) : (
          <Circle className="size-4 text-fg-muted" aria-hidden="true" />
        )}
        {done ? t('done') : t('notDone')}
      </span>
    );
  }
  return (
    <form action={setHabitCheckAction}>
      <input type="hidden" name="habitId" value={habitId} />
      <input type="hidden" name="day" value={day} />
      <input type="hidden" name="done" value={done ? 'false' : 'true'} />
      <Toggle done={done} name={name} date={date} />
    </form>
  );
}
