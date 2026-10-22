import 'server-only';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { isDemoOnly } from '@/lib/demo-mode';
import { routeMessages, type ClientRoute } from './client-messages';

type PageComponent<P> = (props: P) => ReactNode | Promise<ReactNode>;

/**
 * Envolve a página num provedor com só as mensagens que os componentes de cliente dela usam (ADR-0052). Os
 * componentes do shell (layouts) continuam com as mensagens do provedor raiz. A chave é a pasta da página,
 * conferida por teste (`client-messages.test.ts`).
 */
export function withRouteMessages<P extends object>(route: ClientRoute, Page: PageComponent<P>) {
  function RoutePage(props: P) {
    return (
      <NextIntlClientProvider messages={routeMessages(route, isDemoOnly())}>
        <Page {...props} />
      </NextIntlClientProvider>
    );
  }
  RoutePage.displayName = `withRouteMessages(${route})`;
  return RoutePage;
}
