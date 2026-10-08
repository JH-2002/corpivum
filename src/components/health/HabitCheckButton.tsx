'use client';

import { Check, Circle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useFormStatus } from 'react-dom';
import { setHabitCheckAction } from '@/app/(app)/habitos/actions';
import { cn } from '@/lib/cn';

function Toggle({ done, name }: { done: boolean; name: string }) {
  const t = useTranslations('habits');
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-pressed={done}
      aria-label={done ? t('uncheckLabel', { name }) : t('checkLabel', { name })}
      className={cn(
        'inline-flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm font-semibold',
        done
          ? 'border-success bg-success-soft text-success'
          : 'border-border-strong bg-surface text-fg hover:bg-surface-muted',
      )}
    >
      {done ? (
        <Check className="size-4" aria-hidden="true" />
      ) : (
        <Circle className="size-4" aria-hidden="true" />
      )}
      {done ? t('done') : t('markDone')}
    </button>
  );
}

/**
 * Check rápido do hábito no dia (§11.5, §22). `readOnly` (demo): só mostra o estado, sem gravar.
 */
export function HabitCheckButton({
  habitId,
  name,
  day,
  done,
  readOnly = false,
}: {
  habitId: string;
  name: string;
  day: string;
  done: boolean;
  readOnly?: boolean;
}) {
  const t = useTranslations('habits');
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
      <Toggle done={done} name={name} />
    </form>
  );
}
