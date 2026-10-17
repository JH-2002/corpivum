-- Política de Privacidade v2 (fase 7f, ADR-0041): lista as categorias de dados de bem-estar (art. 9º, OI-08), o
-- prazo de 30 dias das contas que não concluem o onboarding (ADR-0037, P7-N2), os cookies e o armazenamento no
-- navegador (OI-36) e onde excluir a conta durante o cadastro (P7-M2). Só descreve o tratamento que já existe,
-- então NÃO é substancial (requires_reconsent = false): mesmo fluxo dos Termos v2 (ADR-0031), aviso único e
-- registro de ciência. `LEGAL-REVIEW` (OI-30, PACOTE_JURIDICO): validar com o jurídico antes do go-live.
-- Nova versão = INSERT, nunca UPDATE: as provas da v1 continuam apontando para a v1 (texto em legal/archive/).
INSERT INTO public.policy_versions (id, document, version, text_hash, requires_reconsent, published_at, updated_at)
VALUES
  (gen_random_uuid(), 'privacy_policy', 2, '939cbbc86e180570fdaf39d049dd5bd08759d5f7e748987788470eee57e00cc2', false, '2026-10-16T00:00:00Z', now());
