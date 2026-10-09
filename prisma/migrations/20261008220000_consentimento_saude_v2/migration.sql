-- Consentimento de dados de saúde v2 (ADR-0027, LEG-C06): texto com as categorias do novo escopo (peso e
-- medidas, sono, hábitos, alimentação, atividade). Mudança substancial: quem autorizou a v1 fica sem
-- tratamento até escolher de novo (`app.has_active_consent` exige versão >= a última substancial publicada).
-- Hash = SHA-256 do texto do catálogo i18n (src/modules/consent/catalog.ts; o teste confere os dois).
-- Nova versão = INSERT, nunca UPDATE: as provas da v1 continuam apontando para a v1.
INSERT INTO public.policy_versions (id, document, version, text_hash, requires_reconsent, published_at, updated_at)
VALUES
  (gen_random_uuid(), 'consent_health_data', 2, 'cd0d42d175c05e0cb6e0e5d492fb4402cde382283bb64f9f3b649d9d91886c6e', true, '2026-10-08T00:00:00Z', now());
