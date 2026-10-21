/**
 * Nome do produto num único lugar (ADR-0043, fase 8b; ADR-0044). Os textos do i18n usam o marcador
 * `%PRODUTO%`, trocado por este nome ao carregar o catálogo (`src/i18n/messages.ts`). Ficam de fora os textos
 * jurídicos versionados (`DOCUMENT_MESSAGES`), cobertos por hash: o nome neles muda no go-live, junto com os
 * textos finais do jurídico (ADR-0043, D5).
 */
export const PRODUCT_NAME = 'Corpivum';

/** Forma minúscula, sem espaço, para nomes de arquivo baixados. */
export const PRODUCT_SLUG = 'corpivum';

/** Marcador do nome nos textos do i18n. */
export const PRODUCT_NAME_MARKER = '%PRODUTO%';
