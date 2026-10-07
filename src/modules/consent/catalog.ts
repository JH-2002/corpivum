/**
 * Catálogo de finalidades e documentos versionados (LEG-C02, LEG-C03, LEG-C06, LEG-G04). Sem dependência de
 * runtime: importado também por componentes cliente.
 *
 * Cada texto vive no i18n (namespace em `DOCUMENT_MESSAGES`). `textHash` = SHA-256 do JSON desse namespace.
 * Mudou o texto? Suba a versão aqui E publique a nova linha em `policy_versions` numa migração nova
 * (INSERT, nunca UPDATE). O teste `catalog.test.ts` falha se o texto mudar sem isso, e o teste de banco
 * confere as versões publicadas. `requiresReconsent: true` = mudança substancial (pede nova escolha).
 */
export const CONSENT_PURPOSES = [
  'health_data',
  'ai_sharing',
  'international_transfer',
  'marketing',
  'product_metrics',
] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

/**
 * Finalidades oferecidas hoje. IA e transferência internacional ficam modeladas (banco, guard), mas só
 * aparecem na Fase 5, quando houver provedor e região para o texto dizer quem processa e onde (LEG-C03).
 */
export const AVAILABLE_PURPOSES = ['health_data', 'marketing', 'product_metrics'] as const;
export type AvailablePurpose = (typeof AVAILABLE_PURPOSES)[number];

export function isAvailablePurpose(purpose: string): purpose is AvailablePurpose {
  return (AVAILABLE_PURPOSES as readonly string[]).includes(purpose);
}

/** Termos (contrato) e ciência da Política: obrigatórios para usar o app. Não são consentimento. */
export const REQUIRED_DOCUMENTS = ['terms', 'privacy_policy'] as const;
export type RequiredDocument = (typeof REQUIRED_DOCUMENTS)[number];

export type PolicyDocument =
  | RequiredDocument
  | 'consent_health_data'
  | 'consent_ai_sharing'
  | 'consent_international_transfer'
  | 'consent_marketing'
  | 'consent_product_metrics';

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
    textHash: 'f198b78b0a2b2a51680e27959b1b4532efa8aca526b94baed48ccdeb40edbf2d',
    requiresReconsent: true,
  },
  terms: {
    version: 1,
    textHash: '705838b552199e7dfe1a5f0b8d996b8b0e03369ddbe82db54de9d6b88cc4121f',
    requiresReconsent: true,
  },
  consent_health_data: {
    version: 1,
    textHash: 'fe50c48f529e3a89039643e6da334c979499805fdc101a22a2029cd54d12f39e',
    requiresReconsent: true,
  },
  consent_marketing: {
    version: 1,
    textHash: 'cfd5bfb2754bc8e9cb7d61dad354b7e7e0c84dca3add64efe6821a5f337e5f6f',
    requiresReconsent: true,
  },
  consent_product_metrics: {
    version: 1,
    textHash: '6421c1d9f76c0656b69e7121ea80a49f1b992ed9ddc8dc509ef71df2dc4d95eb',
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

/** Data de publicação da versão vigente (exibida nas páginas públicas). */
export const PUBLISHED_AT = '2026-10-07';
