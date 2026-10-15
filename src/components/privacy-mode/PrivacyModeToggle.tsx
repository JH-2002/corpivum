'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { usePrivacyMode } from './PrivacyModeProvider';

/**
 * Botão do modo privacidade no header (ADR-0035): `aria-pressed`, ícone e texto (a cor não é o único canal).
 * No mobile o texto fica só para leitores de tela; o ícone muda junto com o estado.
 */
export function PrivacyModeToggle() {
  const t = useTranslations('privacyMode');
  const { hidden, setHidden, pending } = usePrivacyMode();
  const Icon = hidden ? EyeOff : Eye;
  return (
    <button
      type="button"
      aria-pressed={hidden}
      aria-busy={pending || undefined}
      title={t(hidden ? 'turnOff' : 'turnOn')}
      onClick={() => setHidden(!hidden)}
      className={cn(
        'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md px-2 text-sm font-semibold',
        hidden
          ? 'border border-primary bg-primary-soft text-primary-soft-fg'
          : 'text-fg hover:bg-surface-muted',
      )}
    >
      <Icon className="size-5" aria-hidden="true" />
      <span className="sr-only lg:not-sr-only">{t('toggle')}</span>
    </button>
  );
}

/** Indicador visível enquanto o modo está ligado (texto, não só o estado do botão). */
export function PrivacyModeIndicator() {
  const t = useTranslations('privacyMode');
  const { hidden, setHidden } = usePrivacyMode();
  if (!hidden) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border bg-primary-soft px-4 py-2 text-sm text-primary-soft-fg lg:px-6"
    >
      <EyeOff className="size-4 shrink-0" aria-hidden="true" />
      <span className="font-semibold">{t('active')}</span>
      <span>{t('activeHint')}</span>
      <button
        type="button"
        onClick={() => setHidden(false)}
        className="min-h-11 font-semibold underline underline-offset-4"
      >
        {t('turnOff')}
      </button>
    </div>
  );
}
