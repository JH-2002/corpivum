# Mensagens de interface (i18n)

Todas as strings de UI ficam aqui (`pt-BR.json`), carregadas pelo `next-intl` (ver `src/i18n/request.ts`).
As chaves são tipadas: usar uma chave inexistente quebra o `pnpm typecheck`.

## Nome do produto
O nome não é escrito nos textos: use o marcador `%PRODUTO%`, trocado por `PRODUCT_NAME` (`src/config/product.ts`) ao
carregar o catálogo (`src/i18n/messages.ts`). A exceção são os textos jurídicos versionados (`DOCUMENT_MESSAGES`),
cobertos por hash, que ainda dizem "HealthMind 360" até o go-live (ADR-0043 D5, ADR-0044). O teste
`tests/content/product-name.test.ts` garante as duas coisas.

## Regras
- Tom acolhedor, direto, sem jargão e sem culpa (§3, §43, LEG-F05).
- Nenhuma alegação clínica: o teste `tests/content/forbidden-strings.test.ts` varre todos os catálogos
  com o glossário de `tests/content/forbidden-terms.ts` e falha se encontrar (LEG-M03).
- Linguagem de associação, nunca de causa ("costuma aparecer junto com", não "causa").

## Namespace `disclaimer.*` — `LEGAL-REVIEW`
Reservado aos avisos obrigatórios, que contêm negações ("não diagnostica..."). Por isso é **isento** da
varredura de strings proibidas. Em contrapartida:
- as chaves aprovadas ficam listadas em `tests/content/approved-disclaimers.ts`; chave nova ou removida
  quebra o teste até ser aprovada;
- toda alteração passa por revisão no PR (`.github/CODEOWNERS` e checklist do template de PR);
- os textos são RASCUNHO e dependem de revisão jurídica e clínica (`docs/legal/OPEN_ISSUES.md`).
