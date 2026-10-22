'use client';

import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { useIsClient } from '@/lib/browser-store';
import { useMotionPreference } from '@/lib/motion/motion';
import { cn } from '@/lib/cn';

/**
 * Opção "Reduzir animações" (ADR-0048): botão de alternância com `aria-pressed` e o estado também em texto.
 * Fica em Configurações e no menu de ajuda (vale na demo, que não tem configurações).
 */
export function ReduceMotionToggle({ className }: { className?: string }) {
  const t = useTranslations('motion');
  const { userReduced, setUserReduced } = useMotionPreference();
  const client = useIsClient();
  const hintId = useId();
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <button
        type="button"
        aria-pressed={client ? userReduced : false}
        aria-describedby={hintId}
        onClick={() => setUserReduced(!userReduced)}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-3 text-left text-sm font-semibold hover:bg-surface-muted"
      >
        {t('reduce')}
        <span
          aria-hidden="true"
          className={cn(
            'rounded-full border px-2 py-0.5 text-xs',
            userReduced
              ? 'border-primary bg-primary text-primary-fg'
              : 'border-border-strong text-fg-muted',
          )}
        >
          {t(userReduced ? 'on' : 'off')}
        </span>
      </button>
      <p id={hintId} className="px-3 text-sm text-fg-muted">
        {t('hint')}
      </p>
    </div>
  );
}
