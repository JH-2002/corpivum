'use client';

import { RotateCcw, RotateCw, Undo2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { TWIN_VIEWS, VIEW_ANGLE, type TwinView } from './layout';

/** Passo de rotação dos botões (rad). */
export const ROTATE_STEP = Math.PI / 8;

const toggle = (pressed: boolean) =>
  cn(
    'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold',
    pressed
      ? 'border-primary bg-primary-soft text-primary-soft-fg'
      : 'border-border-strong bg-surface text-fg hover:bg-surface-muted',
  );

/**
 * Controles por teclado do modelo (§15, WCAG 2.1.1): vistas frente/costas/lado, girar, restaurar e,
 * Tudo que o arrasto faz também está aqui. Ocultar valores é o modo privacidade global (header, ADR-0035).
 */
export function ViewControls({
  angle,
  onAngle,
  onReset,
}: {
  angle: number;
  onAngle: (angle: number) => void;
  onReset: () => void;
}) {
  const t = useTranslations('twin.controls');
  // A vista fica marcada só quando o modelo está exatamente nela (girar desmarca).
  const pressed = (view: TwinView) =>
    Math.abs(normalize(angle) - VIEW_ANGLE[view]) < 0.01 ||
    (view === 'side' && Math.abs(normalize(angle) - (3 * Math.PI) / 2) < 0.01);
  return (
    <div role="group" aria-label={t('label')} className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label={t('views')} className="flex flex-wrap gap-2">
        {TWIN_VIEWS.map((view) => (
          <button
            key={view}
            type="button"
            className={toggle(pressed(view))}
            aria-pressed={pressed(view)}
            onClick={() => onAngle(VIEW_ANGLE[view])}
          >
            {t(view)}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={toggle(false)}
        aria-label={t('rotateLeft')}
        title={t('rotateLeft')}
        onClick={() => onAngle(angle - ROTATE_STEP)}
      >
        <RotateCcw aria-hidden className="size-5" />
      </button>
      <button
        type="button"
        className={toggle(false)}
        aria-label={t('rotateRight')}
        title={t('rotateRight')}
        onClick={() => onAngle(angle + ROTATE_STEP)}
      >
        <RotateCw aria-hidden className="size-5" />
      </button>
      <button type="button" className={toggle(false)} onClick={onReset}>
        <Undo2 aria-hidden className="size-5" />
        {t('reset')}
      </button>
    </div>
  );
}

function normalize(angle: number): number {
  return ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}
