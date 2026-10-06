'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';

/** Erro inesperado numa página do app. Não exibe nem registra detalhes do erro (LEG-R04). */
export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('common');
  return (
    <StateView
      state="error"
      action={
        <Button variant="secondary" onClick={reset}>
          {t('retry')}
        </Button>
      }
    />
  );
}
