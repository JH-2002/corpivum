'use client';

import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { useStoredValue } from '@/lib/browser-store';
import { cn } from '@/lib/cn';
import {
  BODY_MODEL_STORAGE_KEY,
  BODY_MODELS,
  parseBodyModel,
  type BodyModel,
} from '@/modules/twin';

/**
 * Modelo de visualização do corpo (ADR-0028): preferência de interface só no navegador, padrão neutro.
 * Não vai ao servidor, não entra em cálculo e não é dado de sexo ou gênero.
 */
export function useBodyModel(): [BodyModel, (model: BodyModel) => void] {
  const [raw, setRaw] = useStoredValue('local', BODY_MODEL_STORAGE_KEY);
  return [parseBodyModel(raw), setRaw];
}

export function BodyModelPicker() {
  const t = useTranslations('twin.bodyModel');
  const [model, setModel] = useBodyModel();
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={`${name}-hint`}>
      <legend className="text-sm font-semibold">{t('legend')}</legend>
      <div className="flex flex-wrap gap-2">
        {BODY_MODELS.map((option) => (
          <label
            key={option}
            className={cn(
              'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
              model === option
                ? 'border-primary bg-primary-soft text-primary-soft-fg'
                : 'border-border-strong bg-surface hover:bg-surface-muted',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={model === option}
              onChange={() => setModel(option)}
              className="size-4 accent-primary"
            />
            {t(option)}
          </label>
        ))}
      </div>
      <p id={`${name}-hint`} className="text-sm text-fg-muted">
        {t('hint')}
      </p>
    </fieldset>
  );
}
