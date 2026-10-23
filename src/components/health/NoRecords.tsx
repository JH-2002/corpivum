import { useTranslations } from 'next-intl';
import { buttonClasses } from '@/components/ui/Button';
import { StateView } from '@/components/ui/StateView';
import type { HealthMode } from './HealthPage';

/**
 * Período sem registros numa tela de módulo (9d): diz o próximo passo. Na conta, o formulário da própria página
 * (`#novo`) e um link até ele; na demonstração, onde nada é salvo, trocar o período no topo.
 */
export function NoRecords({ mode, nextStep }: { mode: HealthMode; nextStep: string }) {
  const t = useTranslations('states');
  const own = mode === 'own';
  return (
    <StateView
      state="no-data"
      nextStep={own ? nextStep : t('nextStepDemo')}
      action={
        own ? (
          <a href="#novo" className={buttonClasses('secondary')}>
            {t('goToForm')}
          </a>
        ) : undefined
      }
    />
  );
}
