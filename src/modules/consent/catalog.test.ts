// @vitest-environment node
import { createHash } from 'node:crypto';
import messages from '@messages/pt-BR.json';
import {
  AVAILABLE_PURPOSES,
  CONSENT_PURPOSES,
  CURRENT_VERSIONS,
  DOCUMENT_MESSAGES,
  HEALTH_DATA_GRACE_DAYS_IN_TEXT,
  purposeDocument,
} from './catalog';
import { noticeChangeKey } from '@/components/privacy/policy-notice';

function namespace(path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => {
    if (typeof node !== 'object' || node === null) return undefined;
    return (node as Record<string, unknown>)[key];
  }, messages);
}

/** LEG-C03/C06: o texto exibido é o texto versionado. Mudar o texto exige nova versão (e migração). */
describe('catálogo de documentos versionados', () => {
  it.each(Object.entries(DOCUMENT_MESSAGES))(
    '%s: hash do texto confere com a versão',
    (doc, ns) => {
      const text = namespace(ns);
      expect(text, ns).toBeDefined();
      const hash = createHash('sha256').update(JSON.stringify(text)).digest('hex');
      expect(
        hash,
        `${doc}: texto mudou; suba a versão e publique nova linha em policy_versions`,
      ).toBe(CURRENT_VERSIONS[doc as keyof typeof CURRENT_VERSIONS].textHash);
    },
  );

  it('toda finalidade oferecida tem texto publicado com os 5 campos (LEG-C03)', () => {
    for (const purpose of AVAILABLE_PURPOSES) {
      expect(Object.keys(CURRENT_VERSIONS)).toContain(purposeDocument(purpose));
      const text = namespace(`consent.purposes.${purpose}`) as Record<string, string>;
      for (const field of ['title', 'collected', 'purpose', 'processors', 'refusal', 'revoke']) {
        expect(text[field], `${purpose}.${field}`).toEqual(expect.any(String));
      }
    }
  });

  it('versão vigente não substancial dos Termos ou da Política tem texto de aviso próprio (ADR-0031)', () => {
    for (const document of ['terms', 'privacy_policy'] as const) {
      const current = CURRENT_VERSIONS[document];
      if (current.requiresReconsent) continue;
      const key = noticeChangeKey(document, current.version);
      expect(key, `${document} v${current.version}: falta policyNotice.changes`).not.toBeNull();
      expect(namespace(`policyNotice.${key}`), String(key)).toEqual(expect.any(String));
    }
  });

  it('o prazo de eliminação está escrito no texto versionado (revisão M3)', () => {
    expect(messages.consent.purposes.health_data.revoke).toContain(
      `${HEALTH_DATA_GRACE_DAYS_IN_TEXT} dias`,
    );
    expect(JSON.stringify(messages.consent.purposes)).not.toMatch(/\{days\}/);
  });

  it('finalidades revogadas (IA e transferência internacional, ADR-0030) não existem no catálogo', () => {
    for (const revoked of ['ai_sharing', 'international_transfer']) {
      expect(CONSENT_PURPOSES).not.toContain(revoked);
      expect(AVAILABLE_PURPOSES).not.toContain(revoked);
    }
  });
});
