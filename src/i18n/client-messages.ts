import 'server-only';
import { ROUTE_NAMESPACES, SHELL_NAMESPACES } from './client-namespaces.generated';
import { messages } from './messages';

/** Página com mensagens próprias no navegador: a pasta relativa a `src/app` ("/" na raiz). */
export type ClientRoute = keyof typeof ROUTE_NAMESPACES;

type Catalog = { [key: string]: string | Catalog };

/**
 * No modo só demo (ADR-0044), os textos jurídicos em RASCUNHO nunca vão ao navegador (placeholders do controlador
 * e o nome antigo nos documentos versionados).
 */
const DEMO_ONLY_EXCLUDED = new Set(['legal', 'consent']);

/** Copia do catálogo só os caminhos pedidos ("twin.body" leva só esse ramo de `twin`). */
export function pickMessages(catalog: Catalog, namespaces: readonly string[]): Catalog {
  const out: Catalog = {};
  for (const ns of namespaces) {
    const parts = ns.split('.');
    let source: string | Catalog | undefined = catalog;
    let target = out;
    parts.forEach((part, i) => {
      source = typeof source === 'object' ? source[part] : undefined;
      if (source === undefined) return;
      if (i === parts.length - 1) {
        target[part] = source;
      } else {
        const next = target[part];
        target = typeof next === 'object' ? next : (target[part] = {});
      }
    });
  }
  return out;
}

function clientMessages(namespaces: readonly string[], demoOnly: boolean): Catalog {
  const allowed = demoOnly
    ? namespaces.filter((ns) => !DEMO_ONLY_EXCLUDED.has(ns.split('.')[0]!))
    : namespaces;
  return pickMessages(messages, allowed);
}

/**
 * Mensagens do navegador em volta das páginas (layouts, erro, carregamento): só os namespaces que os componentes
 * de cliente desses arquivos usam (ADR-0052). O resto do catálogo fica no servidor.
 */
export function shellMessages(demoOnly: boolean): Catalog {
  return clientMessages(SHELL_NAMESPACES, demoOnly);
}

/** Mensagens do navegador de uma página: só o que os componentes de cliente dela usam (ADR-0052). */
export function routeMessages(route: ClientRoute, demoOnly: boolean): Catalog {
  return clientMessages(ROUTE_NAMESPACES[route], demoOnly);
}
