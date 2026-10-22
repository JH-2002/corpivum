import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { demoContext } from '@/app/demo/demo-data';
import { PrivacyModeProvider } from '@/components/privacy-mode/PrivacyModeProvider';
import { PresentationContent } from '@/components/presentation/PresentationContent';
import { PresentationDeck } from '@/components/presentation/PresentationDeck';
import { PresentationStart } from '@/components/presentation/PresentationParts';
import { parsePresentationScreen } from '@/components/presentation/screens';
import type { PageSearchParams } from '@/components/shell/ModulePage';
import { isPresenting } from '@/lib/presentation-server';
import { withRouteMessages } from '@/i18n/RouteMessages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('presentation');
  return { title: t('title') };
}

/**
 * Modo apresentação do demo público (§45, LEG-X02, ADR-0035): só dados fictícios, sem sessão e sem banco.
 * Entra sempre com o modo privacidade ligado; quem abre o endereço direto passa pela entrada.
 */
async function DemoPresentationPage({ searchParams }: { searchParams: PageSearchParams }) {
  if (!(await isPresenting())) return <PresentationStart scope="demo" />;
  const screen = parsePresentationScreen((await searchParams).tela);
  const { range, today, source, hidden } = await demoContext();
  return (
    <PrivacyModeProvider initialHidden={hidden} scope="presentation">
      <PresentationDeck scope="demo" screen={screen} own={false} demo>
        <PresentationContent
          screen={screen}
          source={source}
          mode="publicDemo"
          hidden={hidden}
          range={range}
          today={today}
        />
      </PresentationDeck>
    </PrivacyModeProvider>
  );
}

export default withRouteMessages('demo/apresentacao', DemoPresentationPage);
