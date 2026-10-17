-- OI-37 (ADR-0042): as finalidades opcionais `marketing` (novidades por e-mail) e `product_metrics` (métricas de
-- uso ligadas à conta) saem do onboarding e da Central de Privacidade: o app nunca enviou novidades nem coletou
-- métricas. Mesmo modelo do ADR-0030: os valores ficam dormentes no enum (o Postgres não remove valor de enum sem
-- recriar o tipo, `app.has_active_consent` e as políticas RLS) e CHECKs impedem gravar consentimento ou publicar
-- texto para eles.
--
-- Diferente do ADR-0030, essas finalidades tiveram versões publicadas (migração da Fase 1b) e há provas de escolha
-- nos bancos de desenvolvimento. Provas não se apagam (LEG-R03): as autorizações ainda ativas são revogadas aqui
-- (único UPDATE que a guarda aceita) e as CHECKs entram como NOT VALID, que barram toda linha nova e toda alteração,
-- sem exigir que as provas antigas sumam. As provas saem pelo expurgo normal (`PROOF_RETENTION_DAYS`).
UPDATE public.consent_records
   SET revoked_at = now(), updated_at = now()
 WHERE purpose IN ('marketing', 'product_metrics') AND revoked_at IS NULL;

ALTER TABLE public.consent_records
  ADD CONSTRAINT consent_records_purpose_opcional_removida
  CHECK (purpose NOT IN ('marketing', 'product_metrics')) NOT VALID;

ALTER TABLE public.policy_versions
  ADD CONSTRAINT policy_versions_document_opcional_removido
  CHECK (document NOT IN ('consent_marketing', 'consent_product_metrics')) NOT VALID;

-- Política de Privacidade v3: sai a frase sobre os consentimentos opcionais. Só remove funcionalidade e não amplia
-- o tratamento: não substancial, com aviso único e ciência (ADR-0031). Texto da v2 em legal/archive/.
-- `LEGAL-REVIEW` (OI-30).
INSERT INTO public.policy_versions (id, document, version, text_hash, requires_reconsent, published_at, updated_at)
VALUES
  (gen_random_uuid(), 'privacy_policy', 3, 'a4ea2110c40c91d67196df9c9c7cc40ed1d88face51d43d7f89d30208bb30877', false, '2026-10-17T00:00:00Z', now());
