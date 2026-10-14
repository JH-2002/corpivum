/**
 * Catálogo de finalidades e documentos versionados (LEG-C02, LEG-C03, LEG-C06, LEG-G04). Sem dependência de
 * runtime: importado também por componentes cliente.
 *
 * Cada texto vive no i18n (namespace em `DOCUMENT_MESSAGES`). `textHash` = SHA-256 do JSON desse namespace.
 * Mudou o texto? Suba a versão aqui E publique a nova linha em `policy_versions` numa migração nova
 * (INSERT, nunca UPDATE), e arquive o texto antigo em `legal/archive/` (LEG-R03). O teste `catalog.test.ts`
 * falha se o texto mudar sem isso, e o teste de banco
 * confere as versões publicadas. `requiresReconsent: true` = mudança substancial (pede nova escolha).
 */
export const CONSENT_PURPOSES = ['health_data', 'marketing', 'product_metrics'] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

/**
 * Finalidades oferecidas: todas as do catálogo. Compartilhamento com IA e transferência internacional foram
 * revogadas (ADR-0030); os valores continuam no enum do banco só porque o Postgres não remove valor de enum, e
 * um CHECK em `consent_records` e `policy_versions` impede usá-los.
 */
export const AVAILABLE_PURPOSES = CONSENT_PURPOSES;
export type AvailablePurpose = ConsentPurpose;

export function isAvailablePurpose(purpose: string): purpose is AvailablePurpose {
  return (AVAILABLE_PURPOSES as readonly string[]).includes(purpose);
}

/** Termos (contrato) e ciência da Política: obrigatórios para usar o app. Não são consentimento. */
export const REQUIRED_DOCUMENTS = ['terms', 'privacy_policy'] as const;
export type RequiredDocument = (typeof REQUIRED_DOCUMENTS)[number];

/** Documentos versionados vigentes. Os textos das finalidades revogadas (ADR-0030) não existem. */
export const POLICY_DOCUMENTS = [
  ...REQUIRED_DOCUMENTS,
  'consent_health_data',
  'consent_marketing',
  'consent_product_metrics',
] as const;
export type PolicyDocument = (typeof POLICY_DOCUMENTS)[number];

export function isPolicyDocument(document: string): document is PolicyDocument {
  return (POLICY_DOCUMENTS as readonly string[]).includes(document);
}

export function purposeDocument(purpose: ConsentPurpose): PolicyDocument {
  return `consent_${purpose}`;
}

export interface DocumentVersion {
  version: number;
  textHash: string;
  requiresReconsent: boolean;
}

/** Versão vigente de cada documento publicado. */
export const CURRENT_VERSIONS = {
  privacy_policy: {
    version: 1,
    textHash: 'd97b589c8574c2a3cf3f339adb51e4ef491744504e88f77fff906273580afa6a',
    requiresReconsent: true,
  },
  // v2 (ADR-0031): sem a seção "Sugestões do app" (recomendações removidas, ADR-0030). Só remove
  // funcionalidade e não amplia o tratamento: sem novo aceite; aviso único com registro de ciência.
  // `LEGAL-REVIEW` (OI-30). Texto da v1 em `legal/archive/terms.v1.json`.
  terms: {
    version: 2,
    textHash: '8b52ac67dec39808391b76a6724e7daaa3d78a2a09cf5b994310447f35081c66',
    requiresReconsent: false,
  },
  // v2 (ADR-0027): categorias do novo escopo (sem humor, diário e medicamentos). Mudança substancial:
  // quem autorizou a v1 escolhe de novo antes de qualquer tratamento (LEG-C06).
  consent_health_data: {
    version: 2,
    textHash: 'cd0d42d175c05e0cb6e0e5d492fb4402cde382283bb64f9f3b649d9d91886c6e',
    requiresReconsent: true,
  },
  consent_marketing: {
    version: 1,
    textHash: '0d782b27a4743565d7cfeb3d5e94fb6e39b863413cf1973f8c9d55c78b795fde',
    requiresReconsent: true,
  },
  consent_product_metrics: {
    version: 1,
    textHash: '084a0ea0dc34d3ae61c26f4b9f71c66c88276424c60f3c265e2c8c40a57b1fed',
    requiresReconsent: true,
  },
} as const satisfies Partial<Record<PolicyDocument, DocumentVersion>>;

export type PublishedDocument = keyof typeof CURRENT_VERSIONS;

/** Namespace i18n com o texto exato de cada documento publicado (base do `textHash`). */
export const DOCUMENT_MESSAGES = {
  privacy_policy: 'legal.privacyPolicy',
  terms: 'legal.terms',
  consent_health_data: 'consent.purposes.health_data',
  consent_marketing: 'consent.purposes.marketing',
  consent_product_metrics: 'consent.purposes.product_metrics',
} as const satisfies Record<PublishedDocument, string>;

/**
 * Prazo de eliminação após revogar o consentimento de saúde, ESCRITO no texto versionado
 * (`consent.purposes.health_data.revoke`, coberto pelo hash). HEALTH_DATA_GRACE_DAYS precisa ser igual:
 * o serviço recusa iniciar se divergir. Mudar o prazo = novo texto, nova versão e nova migração.
 */
export const HEALTH_DATA_GRACE_DAYS_IN_TEXT = 30;

/** Data de publicação da versão vigente de cada documento obrigatório (exibida nas páginas públicas). */
export const PUBLISHED_AT = {
  privacy_policy: '2026-10-07',
  terms: '2026-10-14',
} as const satisfies Record<RequiredDocument, string>;
