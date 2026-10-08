'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { SubmitButton } from '@/components/forms/FormFields';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

/**
 * Editar (formulário em `<details>`) e excluir (confirmação em 2 cliques) um registro (LEG-D02).
 * `itemLabel` dá contexto ao nome acessível dos botões ("Excluir registro de 06/10").
 */
export function EntryActions({
  id,
  itemLabel,
  deleteAction,
  children,
}: {
  id: string;
  itemLabel: string;
  deleteAction: (form: FormData) => Promise<void>;
  /** Formulário de edição. */
  children: ReactNode;
}) {
  const t = useTranslations('entries');
  return (
    <div className="flex flex-col gap-2">
      <details className="group">
        <summary
          className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-primary"
          aria-label={t('editLabel', { item: itemLabel })}
        >
          {t('edit')}
        </summary>
        <div className="mt-2 rounded-md border border-border p-3">{children}</div>
      </details>
      <ConfirmDialog
        triggerLabel={t('delete')}
        triggerAriaLabel={t('deleteLabel', { item: itemLabel })}
        title={t('deleteTitle')}
      >
        {(close) => (
          <>
            <p className="text-sm">{t('deleteBody', { item: itemLabel })}</p>
            <form action={deleteAction} className="flex flex-wrap gap-3">
              <input type="hidden" name="id" value={id} />
              <SubmitButton>{t('deleteConfirm')}</SubmitButton>
              <Button variant="secondary" onClick={close}>
                {t('deleteKeep')}
              </Button>
            </form>
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}
