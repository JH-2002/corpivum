'use client';

import { useId, useTransition } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import { MAIN_CONTENT_ID } from '@/components/ui/SkipLink';
import type { RequiredDocument } from '@/modules/consent';

/**
 * "Entendi" do aviso de versão nova (ADR-0031). Desabilita durante o envio (sem clique duplo) e, quando o aviso
 * some, leva o foco ao conteúdo principal (WCAG 2.4.3).
 */
export function AcknowledgeForm({
  documents,
  action,
  label,
  hint,
}: {
  documents: readonly RequiredDocument[];
  action: (form: FormData) => Promise<void>;
  label: string;
  hint: string;
}) {
  const [pending, startTransition] = useTransition();
  const hintId = useId();
  return (
    <form
      action={(form) =>
        startTransition(async () => {
          await action(form);
          document.getElementById(MAIN_CONTENT_ID)?.focus();
        })
      }
      className="flex flex-wrap items-center gap-3"
    >
      {documents.map((doc) => (
        <input key={doc} type="hidden" name="document" value={doc} />
      ))}
      <button
        type="submit"
        disabled={pending}
        aria-describedby={hintId}
        className={buttonClasses('secondary')}
      >
        {label}
      </button>
      <p id={hintId} className="text-xs text-fg-muted">
        {hint}
      </p>
    </form>
  );
}
