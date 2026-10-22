import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { buttonClasses } from '@/components/ui/Button';
import { requireDataChoiceSession } from '@/modules/consent/server';
import { chooseDataModeAction } from '../../actions';
import { withRouteMessages } from '@/i18n/RouteMessages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('onboarding.dataChoice');
  return { title: t('title') };
}

/**
 * §52 passo 5: explorar com dados de demonstração (fictícios, gerados em memória, nada gravado) ou começar
 * do zero (ADR-0021). Dá para trocar depois pela faixa "Começar com meus dados".
 */
async function OnboardingDataChoicePage() {
  await requireDataChoiceSession();
  const t = await getTranslations('onboarding');
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-fg-muted">{t('step', { current: 3, total: 3 })}</p>
      <h1 className="text-2xl font-bold">{t('dataChoice.title')}</h1>
      <p>{t('dataChoice.intro')}</p>
      <form action={chooseDataModeAction} className="grid gap-4 sm:grid-cols-2">
        <section
          aria-labelledby="choice-own"
          className="flex flex-col gap-3 rounded-md border border-border p-4"
        >
          <h2 id="choice-own" className="text-lg font-semibold">
            {t('dataChoice.ownTitle')}
          </h2>
          <p className="text-sm text-fg-muted">{t('dataChoice.ownBody')}</p>
          <button
            type="submit"
            name="mode"
            value="own"
            className={buttonClasses('primary', 'mt-auto self-start')}
          >
            {t('dataChoice.ownCta')}
          </button>
        </section>
        <section
          aria-labelledby="choice-demo"
          className="flex flex-col gap-3 rounded-md border border-border p-4"
        >
          <h2 id="choice-demo" className="text-lg font-semibold">
            {t('dataChoice.demoTitle')}
          </h2>
          <p className="text-sm text-fg-muted">{t('dataChoice.demoBody')}</p>
          <button
            type="submit"
            name="mode"
            value="demo"
            className={buttonClasses('secondary', 'mt-auto self-start')}
          >
            {t('dataChoice.demoCta')}
          </button>
        </section>
      </form>
    </div>
  );
}

export default withRouteMessages('(onboarding)/boas-vindas/dados', OnboardingDataChoicePage);
