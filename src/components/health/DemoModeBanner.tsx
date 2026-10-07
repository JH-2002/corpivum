'use client';

import { FlaskConical } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { switchToOwnDataAction } from '@/app/(app)/inicio/actions';
import { SubmitButton } from '@/components/forms/FormFields';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

/**
 * Faixa do modo demonstração dentro da conta (§52.5, ADR-0021): diz que os dados são fictícios e leva a
 * "Começar com meus dados" com confirmação. Nada fictício foi gravado, então não há o que apagar.
 */
export function DemoModeBanner() {
  const t = useTranslations('demo');
  return (
    <section
      aria-labelledby="demo-banner-title"
      className="flex flex-col gap-3 rounded-lg border border-border-strong bg-surface-muted p-4 sm:flex-row sm:items-center"
    >
      <FlaskConical className="size-6 shrink-0 text-primary" aria-hidden="true" />
      <div className="flex-1">
        <h2 id="demo-banner-title" className="font-semibold">
          {t('bannerTitle')}
        </h2>
        <p className="text-sm text-fg-muted">{t('bannerBody')}</p>
      </div>
      <ConfirmDialog
        triggerLabel={t('switchCta')}
        triggerVariant="primary"
        title={t('switchTitle')}
      >
        {(close) => (
          <>
            <p className="text-sm">{t('switchBody')}</p>
            <form action={switchToOwnDataAction} className="flex flex-wrap gap-3">
              <SubmitButton>{t('switchConfirm')}</SubmitButton>
              <Button variant="secondary" onClick={close}>
                {t('switchKeep')}
              </Button>
            </form>
          </>
        )}
      </ConfirmDialog>
    </section>
  );
}

/** Aviso no lugar de formulários quando os dados exibidos são de demonstração. */
export function DemoReadOnlyNotice({ publicDemo = false }: { publicDemo?: boolean }) {
  const t = useTranslations('demo');
  return (
    <p className="rounded-md border border-border bg-surface-muted p-3 text-sm">
      {publicDemo ? t('readOnlyPublic') : t('readOnly')}
    </p>
  );
}
