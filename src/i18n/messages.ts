import raw from '@messages/pt-BR.json';
import { PRODUCT_NAME, PRODUCT_NAME_MARKER } from '@/config/product';

type Catalog = { [key: string]: string | Catalog };

function resolve(node: Catalog): Catalog {
  return Object.fromEntries(
    Object.entries(node).map(([key, value]) => [
      key,
      typeof value === 'string'
        ? value.replaceAll(PRODUCT_NAME_MARKER, PRODUCT_NAME)
        : resolve(value),
    ]),
  );
}

/**
 * Catálogo pt-BR com o nome do produto no lugar do marcador (`src/config/product.ts`). Toda leitura das
 * mensagens passa por aqui; o JSON cru só serve de tipo (`global.d.ts`) e para os testes que conferem o texto
 * literal (strings proibidas, hash dos documentos versionados).
 */
export const messages = resolve(raw) as typeof raw;

/**
 * Catálogo enviado ao navegador no modo só demo (ADR-0044): sem `legal` e `consent`, que só o app completo usa.
 * São os textos jurídicos em RASCUNHO, com os placeholders do controlador e o nome antigo nos versionados
 * (ADR-0043 D5); sem isso eles iriam no payload de toda página da demo.
 */
export function demoClientMessages(): Omit<typeof messages, 'legal' | 'consent'> {
  const { legal: _legal, consent: _consent, ...rest } = messages;
  return rest;
}
