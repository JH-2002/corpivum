-- Remoção do assistente de IA (ADR-0030): as finalidades de compartilhamento com IA e de transferência
-- internacional foram revogadas. O Postgres não remove valor de enum sem recriar o tipo, a função
-- app.has_active_consent e todas as políticas RLS que a usam; por isso os valores ficam dormentes no enum e
-- estas CHECKs impedem publicar texto ou gravar consentimento para eles. Nunca houve linha com esses valores
-- (o serviço sempre recusou conceder, e não existe versão publicada desses textos).
ALTER TABLE public.consent_records
  ADD CONSTRAINT consent_records_purpose_ativo
  CHECK (purpose NOT IN ('ai_sharing', 'international_transfer'));

ALTER TABLE public.policy_versions
  ADD CONSTRAINT policy_versions_document_ativo
  CHECK (document NOT IN ('consent_ai_sharing', 'consent_international_transfer'));
