'use client';

import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { useStoredValue } from '@/lib/browser-store';
import { cn } from '@/lib/cn';
import {
  BODY_MODEL_STORAGE_KEY,
  BODY_MODELS,
  DEMO_BODY_MODEL,
  DEMO_BODY_MODEL_STORAGE_KEY,
  parseBodyModel,
  type BodyModel,
} from '@/modules/twin';

/**
 * Modelo de visualização do corpo (ADR-0028): preferência de interface só no navegador, sem padrão assumido
 * (`null` até a pessoa escolher). Não vai ao servidor, não entra em cálculo e não é dado de sexo ou gênero.
 * `demo` (ADR-0049): a pessoa fictícia começa com `DEMO_BODY_MODEL`, e a troca fica em chave própria.
 */
export function useBodyModel(demo = false): [BodyModel | null, (model: BodyModel) => void] {
  const [raw, setRaw] = useStoredValue(
    'local',
    demo ? DEMO_BODY_MODEL_STORAGE_KEY : BODY_MODEL_STORAGE_KEY,
  );
  const model = parseBodyModel(raw);
  return [demo ? (model ?? DEMO_BODY_MODEL) : model, setRaw];
}

const option = (selected: boolean) =>
  cn(
    'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-semibold',
    selected
      ? 'border-primary bg-primary-soft text-primary-soft-fg'
      : 'border-border-strong bg-surface hover:bg-surface-muted',
  );

/**
 * Primeira visita (sem escolha guardada): pergunta qual modelo a pessoa prefere ver. Não é modal; até a
 * escolha, o twin mostra o corpo gerado em código. Depois, a troca fica no `BodyModelPicker`.
 */
export function BodyModelPrompt() {
  const t = useTranslations('twin.bodyModel');
  // Só contas reais perguntam: a demo já tem modelo (ADR-0049).
  const [, setModel] = useBodyModel();
  const id = useId();
  return (
    <section
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-hint`}
      className="flex flex-col gap-3 rounded-lg border border-primary bg-primary-soft p-4 text-primary-soft-fg"
    >
      <h3 id={`${id}-title`} className="text-base font-semibold">
        {t('promptTitle')}
      </h3>
      <p id={`${id}-hint`} className="text-sm">
        {t('hint')}
      </p>
      <div className="flex flex-wrap gap-2">
        {BODY_MODELS.map((model) => (
          <button
            key={model}
            type="button"
            className={option(false)}
            onClick={() => setModel(model)}
          >
            {t(model)}
          </button>
        ))}
      </div>
    </section>
  );
}

/** Troca do modelo depois da primeira escolha. */
export function BodyModelPicker({ demo = false }: { demo?: boolean }) {
  const t = useTranslations('twin.bodyModel');
  const [model, setModel] = useBodyModel(demo);
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={`${name}-hint`}>
      <legend className="text-sm font-semibold">{t('legend')}</legend>
      <div className="flex flex-wrap gap-2">
        {BODY_MODELS.map((value) => (
          <label
            key={value}
            className={cn(
              option(model === value),
              'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
            )}
          >
            <input
              type="radio"
              name={name}
              value={value}
              checked={model === value}
              onChange={() => setModel(value)}
              className="size-4 accent-primary"
            />
            {t(value)}
          </label>
        ))}
      </div>
      <p id={`${name}-hint`} className="text-sm text-fg-muted">
        {t('hint')}
      </p>
    </fieldset>
  );
}
