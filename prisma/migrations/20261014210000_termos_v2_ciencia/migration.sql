-- Termos de Uso v2 (ADR-0031): sai a seção "Sugestões do app" (recomendações removidas, ADR-0030). A mudança só
-- remove funcionalidade e não amplia o tratamento, então NÃO é substancial (requires_reconsent = false): quem
-- aceitou a v1 continua com o aceite válido e vê um aviso único; a ciência fica registrada como prova.
-- `LEGAL-REVIEW` (OI-30): validar com o jurídico antes do go-live.

-- Aceite × ciência na mesma tabela de prova (LEG-R03), distinguidos por `kind`.
CREATE TYPE public.policy_acceptance_kind AS ENUM ('accepted', 'acknowledged');
ALTER TABLE public.policy_acceptances
  ADD COLUMN kind public.policy_acceptance_kind NOT NULL DEFAULT 'accepted';

ALTER TYPE public.audit_action ADD VALUE 'policy_acknowledged';

-- Guarda: além das regras anteriores (só Termos e Política, só a versão vigente), a ciência só vale para versão
-- não substancial e para quem já registrou uma versão anterior do mesmo documento. Ninguém "dá ciência" no lugar
-- de um aceite exigido.
CREATE OR REPLACE FUNCTION app.policy_acceptances_guard() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_doc text;
  v_version integer;
  v_latest integer;
  v_substantial boolean;
BEGIN
  SELECT v.document::text, v.version, v.requires_reconsent INTO v_doc, v_version, v_substantial
    FROM public.policy_versions v WHERE v.id = NEW.policy_version_id;
  SELECT max(l.version) INTO v_latest
    FROM public.policy_versions l WHERE l.document::text = v_doc AND l.published_at <= now();
  IF v_doc IS NULL OR v_doc NOT IN ('terms', 'privacy_policy') OR v_version IS DISTINCT FROM v_latest THEN
    RAISE EXCEPTION 'invalid policy acceptance' USING ERRCODE = '23514';
  END IF;
  IF NEW.kind = 'acknowledged' AND (
       v_substantial
       OR NOT EXISTS (
         SELECT 1 FROM public.policy_acceptances a
           JOIN public.policy_versions p ON p.id = a.policy_version_id
          WHERE a.user_id = NEW.user_id AND p.document::text = v_doc AND p.version < v_version)) THEN
    RAISE EXCEPTION 'invalid policy acknowledgement' USING ERRCODE = '23514';
  END IF;
  NEW.accepted_at := now();
  NEW.created_at := now();
  RETURN NEW;
END;
$$;

-- Nova versão = INSERT, nunca UPDATE: as provas da v1 continuam apontando para a v1 (texto em legal/archive/).
INSERT INTO public.policy_versions (id, document, version, text_hash, requires_reconsent, published_at, updated_at)
VALUES
  (gen_random_uuid(), 'terms', 2, '8b52ac67dec39808391b76a6724e7daaa3d78a2a09cf5b994310447f35081c66', false, '2026-10-14T00:00:00Z', now());
