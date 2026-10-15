import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { healthView } from '@/components/health/HealthPage';
import { PrivacyModeProvider } from '@/components/privacy-mode/PrivacyModeProvider';
import { PresentationContent } from '@/components/presentation/PresentationContent';
import { PresentationDeck } from '@/components/presentation/PresentationDeck';
import {
  PresentationDataSwitch,
  PresentationStart,
} from '@/components/presentation/PresentationParts';
import { parsePresentationScreen, wantsOwnData } from '@/components/presentation/screens';
import type { PageSearchParams } from '@/components/shell/ModulePage';
import { readPeriod } from '@/lib/period-server';
import { isPresenting } from '@/lib/presentation-server';
import { readPrivacyMode } from '@/lib/privacy-mode-server';
import { requireAppSession } from '@/modules/consent/server';
import { createDemoSourceFor } from '@/modules/health/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('presentation');
  return { title: t('title') };
}

/**
 * Modo apresentação da conta (§45, ADR-0035): fora do shell, em tela cheia. Dados de demonstração por
 * padrão; "meus dados" é opcional e só com consentimento ativo (`healthView`). Entra sempre com o modo
 * privacidade ligado (`enterPresentationAction`); quem abre o endereço direto passa pela entrada.
 */
export default async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  // Validação da sessão em cada página (LEG-S04), como nas telas do shell.
  const session = await requireAppSession();
  if (!(await isPresenting())) return <PresentationStart scope="app" />;
  const params = await searchParams;
  const screen = parsePresentationScreen(params.tela);
  const { range, today } = await readPeriod();
  const hidden = await readPrivacyMode();
  const view = healthView(session, today);
  const ownAvailable = view.kind === 'data' && view.mode === 'own';
  const own = ownAvailable && wantsOwnData(params.dados);
  const source = own && view.kind === 'data' ? view.source : createDemoSourceFor(today);

  return (
    <PrivacyModeProvider initialHidden={hidden}>
      <PresentationDeck
        scope="app"
        screen={screen}
        own={own}
        demo={!own}
        dataSwitch={
          <PresentationDataSwitch screen={screen} own={own} ownAvailable={ownAvailable} />
        }
      >
        <PresentationContent
          screen={screen}
          source={source}
          mode={own ? 'own' : 'appDemo'}
          hidden={hidden}
          range={range}
          today={today}
        />
      </PresentationDeck>
    </PrivacyModeProvider>
  );
}
