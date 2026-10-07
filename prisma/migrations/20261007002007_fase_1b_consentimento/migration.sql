-- CreateEnum
CREATE TYPE "consent_purpose" AS ENUM ('health_data', 'ai_sharing', 'international_transfer', 'marketing', 'product_metrics');

-- CreateEnum
CREATE TYPE "policy_document" AS ENUM ('privacy_policy', 'terms', 'consent_health_data', 'consent_ai_sharing', 'consent_international_transfer', 'consent_marketing', 'consent_product_metrics');

-- CreateEnum
CREATE TYPE "privacy_request_kind" AS ENUM ('confirmation_access', 'correction', 'portability', 'deletion', 'anonymization', 'sharing_info', 'automated_review', 'minor_closure');

-- CreateEnum
CREATE TYPE "privacy_request_status" AS ENUM ('open', 'in_progress', 'completed', 'rejected');

-- CreateEnum
CREATE TYPE "audit_action" AS ENUM ('onboarding_completed', 'policy_accepted', 'consent_granted', 'consent_revoked', 'health_data_elimination_scheduled', 'health_data_elimination_cancelled', 'health_data_eliminated', 'session_revoked', 'privacy_request_created', 'account_closed_minor');

-- CreateEnum
CREATE TYPE "audit_resource_type" AS ENUM ('user', 'consent_record', 'policy_version', 'privacy_request', 'session', 'health_data');

-- CreateEnum
CREATE TYPE "job_status" AS ENUM ('queued', 'running', 'failed');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "health_data_purge_at" TIMESTAMPTZ(3),
ADD COLUMN     "onboarding_completed_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "policy_versions" (
    "id" UUID NOT NULL,
    "document" "policy_document" NOT NULL,
    "version" INTEGER NOT NULL,
    "text_hash" TEXT NOT NULL,
    "requires_reconsent" BOOLEAN NOT NULL,
    "published_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "policy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" "consent_purpose" NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "text_hash" TEXT NOT NULL,
    "granted_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_acceptances" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "accepted_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "policy_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "privacy_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "privacy_request_kind" NOT NULL,
    "status" "privacy_request_status" NOT NULL,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "closed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "privacy_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "subject_user_id" UUID,
    "action" "audit_action" NOT NULL,
    "resource_type" "audit_resource_type" NOT NULL,
    "resource_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "ip" INET,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_queue" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "run_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "job_status" NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL,
    "singleton_key" TEXT,
    "locked_until" TIMESTAMPTZ(3),
    "locked_by" TEXT,
    "last_error_code" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "job_queue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "policy_versions_document_version_key" ON "policy_versions"("document", "version");

-- CreateIndex
CREATE INDEX "consent_records_user_id_purpose_idx" ON "consent_records"("user_id", "purpose");

-- CreateIndex
CREATE INDEX "policy_acceptances_user_id_idx" ON "policy_acceptances"("user_id");

-- CreateIndex
CREATE INDEX "privacy_requests_user_id_idx" ON "privacy_requests"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_subject_user_id_created_at_idx" ON "audit_logs"("subject_user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "access_logs_occurred_at_idx" ON "access_logs"("occurred_at");

-- CreateIndex
CREATE INDEX "access_logs_user_id_occurred_at_idx" ON "access_logs"("user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "job_queue_status_run_at_idx" ON "job_queue"("status", "run_at");

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_policy_version_id_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_acceptances" ADD CONSTRAINT "policy_acceptances_policy_version_id_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =====================================================================================================
-- Escrito à mão (ADR-0019; LEG-C01–C06, LEG-S03, LEG-S06, LEG-R02, LEG-R03, OI-14, PR1a-R3-B8).
-- Mesmas regras da ADR-0015 para funções SECURITY DEFINER: search_path fixo, objetos qualificados,
-- sem SQL dinâmico, retorno mínimo, EXECUTE só para app_user.
--
-- PREMISSA DO EXPURGO (PR1a-R3-B8): as tabelas de prova (consent_records, policy_acceptances,
-- privacy_requests, audit_logs) e access_logs NÃO têm FK para users. Apagar uma conta (expurgo de contas
-- não verificadas, encerramento de menor, eliminação da Fase 6) não as apaga em cascata nem é bloqueado.
-- Teste: tests/db/retention.test.ts lista as FKs para users.
-- =====================================================================================================

COMMENT ON FUNCTION app.auth_purge_expired() IS
  'Expurgo de auth (ADR-0017/0018). O DELETE FROM users pressupõe que só tabelas de auth e de dados do próprio usuário referenciam users (CASCADE); provas não têm FK (ADR-0019, PR1a-R3-B8).';

-- ---------- users: colunas novas que o runtime pode alterar (ADR-0017) ----------
GRANT UPDATE (onboarding_completed_at, health_data_purge_at) ON public.users TO app_user;

-- ---------- RLS ----------
ALTER TABLE public.policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_requests ENABLE ROW LEVEL SECURITY;
-- Sem políticas: tudo negado ao runtime; acesso só pelas funções abaixo.
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_queue ENABLE ROW LEVEL SECURITY;

-- Catálogo público de versões (sem dado pessoal). Só leitura.
CREATE POLICY policy_versions_read ON public.policy_versions FOR SELECT USING (true);

CREATE POLICY consent_records_owner_select ON public.consent_records FOR SELECT
  USING (user_id = (SELECT app.current_user_id()));
CREATE POLICY consent_records_owner_insert ON public.consent_records FOR INSERT
  WITH CHECK (user_id = (SELECT app.current_user_id()));
CREATE POLICY consent_records_owner_update ON public.consent_records FOR UPDATE
  USING (user_id = (SELECT app.current_user_id()))
  WITH CHECK (user_id = (SELECT app.current_user_id()));

CREATE POLICY policy_acceptances_owner_select ON public.policy_acceptances FOR SELECT
  USING (user_id = (SELECT app.current_user_id()));
CREATE POLICY policy_acceptances_owner_insert ON public.policy_acceptances FOR INSERT
  WITH CHECK (user_id = (SELECT app.current_user_id()));

CREATE POLICY privacy_requests_owner_select ON public.privacy_requests FOR SELECT
  USING (user_id = (SELECT app.current_user_id()));

-- ---------- Privilégios ----------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.policy_versions FROM app_user;
-- Prova: o runtime insere e só pode preencher revoked_at. Nunca apaga.
REVOKE UPDATE, DELETE, TRUNCATE ON public.consent_records FROM app_user;
GRANT UPDATE (revoked_at, updated_at) ON public.consent_records TO app_user;
REVOKE UPDATE, DELETE, TRUNCATE ON public.policy_acceptances FROM app_user;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.privacy_requests FROM app_user;
REVOKE ALL ON public.audit_logs FROM app_user;
REVOKE ALL ON public.access_logs FROM app_user;
REVOKE ALL ON public.job_queue FROM app_user;

-- ---------- Integridade das provas (gatilhos) ----------

-- Consentimento: só a versão vigente do texto da própria finalidade, com o hash dela. A revogação é
-- definitiva: um novo consentimento cria outro registro.
CREATE FUNCTION app.consent_records_guard() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_doc text;
  v_version integer;
  v_hash text;
  v_latest integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT v.document::text, v.version, v.text_hash INTO v_doc, v_version, v_hash
      FROM public.policy_versions v WHERE v.id = NEW.policy_version_id;
    SELECT max(l.version) INTO v_latest
      FROM public.policy_versions l
     WHERE l.document::text = v_doc AND l.published_at <= now();
    IF v_doc IS DISTINCT FROM 'consent_' || NEW.purpose::text
       OR v_hash IS DISTINCT FROM NEW.text_hash
       OR v_version IS DISTINCT FROM v_latest
       OR NEW.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'invalid consent record' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL THEN
    RAISE EXCEPTION 'consent revocation is final' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER consent_records_guard BEFORE INSERT OR UPDATE ON public.consent_records
  FOR EACH ROW EXECUTE FUNCTION app.consent_records_guard();

-- Aceite: só Termos e Política, na versão vigente.
CREATE FUNCTION app.policy_acceptances_guard() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_doc text;
  v_version integer;
  v_latest integer;
BEGIN
  SELECT v.document::text, v.version INTO v_doc, v_version
    FROM public.policy_versions v WHERE v.id = NEW.policy_version_id;
  SELECT max(l.version) INTO v_latest
    FROM public.policy_versions l WHERE l.document::text = v_doc AND l.published_at <= now();
  IF v_doc IS NULL OR v_doc NOT IN ('terms', 'privacy_policy') OR v_version IS DISTINCT FROM v_latest THEN
    RAISE EXCEPTION 'invalid policy acceptance' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER policy_acceptances_guard BEFORE INSERT ON public.policy_acceptances
  FOR EACH ROW EXECUTE FUNCTION app.policy_acceptances_guard();

-- ---------- Consentimento ativo (guard da aplicação e políticas RLS das tabelas de saúde) ----------
-- Ativo = não revogado E na versão >= última versão substancial publicada da finalidade (LEG-C04, C06).
-- SECURITY INVOKER: lê consent_records sob o RLS do próprio usuário.
-- Fase 2 em diante: tabelas de saúde usam `(SELECT app.has_active_consent('health_data'))` nas políticas
-- de SELECT/INSERT/UPDATE; o DELETE fica só por dono, para a eliminação funcionar após a revogação.
CREATE FUNCTION app.has_active_consent(p_purpose public.consent_purpose) RETURNS boolean
  LANGUAGE sql STABLE
  SET search_path = pg_catalog, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.consent_records c
      JOIN public.policy_versions v ON v.id = c.policy_version_id
     WHERE c.user_id = app.current_user_id()
       AND c.purpose = p_purpose
       AND c.revoked_at IS NULL
       AND v.version >= coalesce((
             SELECT max(l.version) FROM public.policy_versions l
              WHERE l.document = v.document AND l.requires_reconsent AND l.published_at <= now()), 0)
  );
$$;

-- ---------- AuditLog (LEG-S06): só metadados ----------
CREATE FUNCTION app.audit_append(p_action public.audit_action, p_resource_type public.audit_resource_type,
                                 p_resource_id uuid, p_system boolean DEFAULT false)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_user uuid := app.current_user_id();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'audit requires user context' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.audit_logs (id, actor_user_id, subject_user_id, action, resource_type, resource_id,
                                 created_at, updated_at)
  VALUES (gen_random_uuid(), CASE WHEN p_system THEN NULL ELSE v_user END, v_user, p_action,
          p_resource_type, p_resource_id, now(), now());
END;
$$;

-- ---------- AccessLog (LEG-R02): IP + data/hora, no contexto do usuário ----------
CREATE FUNCTION app.access_log_append(p_ip text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_user uuid := app.current_user_id();
  v_ip inet;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'access log requires user context' USING ERRCODE = '42501';
  END IF;
  BEGIN
    v_ip := p_ip::inet;
  EXCEPTION WHEN others THEN
    v_ip := NULL;
  END;
  INSERT INTO public.access_logs (id, user_id, ip, occurred_at, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user, v_ip, now(), now(), now());
END;
$$;

-- ---------- Encerramento de conta de quem se descobre menor (LEG-F04) ----------
-- Só a própria conta (contexto da transação). Guarda a prova mínima e apaga a conta na hora: sessões,
-- tokens e dados do usuário saem em cascata; as provas ficam (sem FK).
CREATE FUNCTION app.account_close_minor() RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_user uuid := app.current_user_id();
  v_request uuid := gen_random_uuid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'account closure requires user context' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_user) THEN
    RAISE EXCEPTION 'account not found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.privacy_requests (id, user_id, kind, status, due_at, closed_at, created_at, updated_at)
  VALUES (v_request, v_user, 'minor_closure', 'completed', now(), now(), now(), now());
  UPDATE public.consent_records c SET revoked_at = now(), updated_at = now()
   WHERE c.user_id = v_user AND c.revoked_at IS NULL;
  INSERT INTO public.audit_logs (id, actor_user_id, subject_user_id, action, resource_type, resource_id,
                                 created_at, updated_at)
  VALUES (gen_random_uuid(), v_user, v_user, 'privacy_request_created', 'privacy_request', v_request,
          now(), now()),
         (gen_random_uuid(), v_user, v_user, 'account_closed_minor', 'user', NULL, now(), now());
  DELETE FROM public.users u WHERE u.id = v_user;
  RETURN v_request;
END;
$$;

-- ---------- Retenção (jobs privacy.*) ----------
CREATE FUNCTION app.privacy_purge_access_logs(p_days integer) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_days IS NULL OR p_days < 1 OR p_days > 180 THEN
    RAISE EXCEPTION 'invalid retention' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.access_logs a WHERE a.occurred_at < now() - make_interval(days => p_days);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Provas (LEG-R03): prazo contado do fim de cada registro (revogação, encerramento do pedido, conta
-- inexistente). `LEGAL-REVIEW` (OI-04).
CREATE FUNCTION app.privacy_purge_proofs(p_days integer) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_cutoff timestamptz;
  v_n integer;
  v_total integer := 0;
BEGIN
  IF p_days IS NULL OR p_days < 365 THEN
    RAISE EXCEPTION 'invalid retention' USING ERRCODE = '22023';
  END IF;
  v_cutoff := now() - make_interval(days => p_days);

  DELETE FROM public.consent_records c
   WHERE c.revoked_at < v_cutoff
      OR (c.granted_at < v_cutoff AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = c.user_id));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  DELETE FROM public.policy_acceptances p
   WHERE p.accepted_at < v_cutoff
     AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p.user_id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  DELETE FROM public.privacy_requests r WHERE r.closed_at < v_cutoff;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  DELETE FROM public.audit_logs a WHERE a.created_at < v_cutoff;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_total := v_total + v_n;

  RETURN v_total;
END;
$$;

-- Rede de segurança da eliminação agendada (ADR-0019): contas com eliminação de dados de saúde vencida.
CREATE FUNCTION app.privacy_due_health_eliminations(p_limit integer)
  RETURNS TABLE (user_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
  SELECT u.id FROM public.users u
   WHERE u.health_data_purge_at <= now() AND u.deleted_at IS NULL
   ORDER BY u.health_data_purge_at
   LIMIT least(greatest(p_limit, 1), 1000);
$$;

-- ---------- Fila de jobs no Postgres (OI-14; PR1a-R2-B6) ----------
-- No máximo um job `queued` por singleton_key: N instâncias agendando o mesmo job recorrente não criam
-- N cadeias. Um job em execução pode agendar o próximo da mesma chave.
CREATE UNIQUE INDEX job_queue_singleton_queued ON public.job_queue (singleton_key)
  WHERE singleton_key IS NOT NULL AND status = 'queued';

CREATE FUNCTION app.jobs_enqueue(p_name text, p_payload jsonb, p_run_at timestamptz,
                                 p_max_attempts integer, p_singleton_key text)
  RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_name !~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$'
     OR jsonb_typeof(p_payload) <> 'object'
     OR octet_length(p_payload::text) > 2048
     OR p_max_attempts < 1 OR p_max_attempts > 20
     OR (p_singleton_key IS NOT NULL AND p_singleton_key !~ '^[A-Za-z0-9_.:-]{1,128}$') THEN
    RAISE EXCEPTION 'invalid job arguments' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.job_queue AS j (id, name, payload, run_at, status, attempts, max_attempts,
                                     singleton_key, created_at, updated_at)
  VALUES (gen_random_uuid(), p_name, p_payload, coalesce(p_run_at, now()), 'queued', 0, p_max_attempts,
          p_singleton_key, now(), now())
  ON CONFLICT (singleton_key) WHERE singleton_key IS NOT NULL AND status = 'queued' DO NOTHING
  RETURNING j.id INTO v_id;
  IF v_id IS NULL THEN
    SELECT q.id INTO v_id FROM public.job_queue q
     WHERE q.singleton_key = p_singleton_key AND q.status = 'queued';
  END IF;
  RETURN v_id;
END;
$$;

-- Reserva até p_limit jobs vencidos (ou travados por worker que morreu). SKIP LOCKED: dois workers nunca
-- pegam o mesmo job.
CREATE FUNCTION app.jobs_claim(p_worker text, p_names text[], p_limit integer, p_lock_seconds integer)
  RETURNS TABLE (id uuid, name text, payload jsonb, attempts integer)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF p_limit < 1 OR p_limit > 100 OR p_lock_seconds < 1 OR p_lock_seconds > 3600 THEN
    RAISE EXCEPTION 'invalid claim arguments' USING ERRCODE = '22023';
  END IF;
  -- Travados e sem tentativas restantes: falham.
  UPDATE public.job_queue j
     SET status = 'failed', last_error_code = 'lock_expired', locked_until = NULL, locked_by = NULL,
         updated_at = now()
   WHERE j.status = 'running' AND j.locked_until < now() AND j.attempts >= j.max_attempts;
  -- Limpeza oportunista de falhas antigas.
  DELETE FROM public.job_queue j WHERE j.status = 'failed' AND j.updated_at < now() - interval '30 days';

  RETURN QUERY
  WITH c AS (
    SELECT q.id FROM public.job_queue q
     WHERE q.name = ANY (p_names)
       AND ((q.status = 'queued' AND q.run_at <= now())
            OR (q.status = 'running' AND q.locked_until < now()))
     ORDER BY q.run_at
     LIMIT p_limit
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.job_queue j
     SET status = 'running', attempts = j.attempts + 1,
         locked_until = now() + make_interval(secs => p_lock_seconds), locked_by = p_worker,
         updated_at = now()
    FROM c
   WHERE j.id = c.id
  RETURNING j.id, j.name, j.payload, j.attempts;
END;
$$;

-- Concluído: o job é apagado (a fila não guarda histórico).
CREATE FUNCTION app.jobs_complete(p_id uuid, p_worker text) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  DELETE FROM public.job_queue j WHERE j.id = p_id AND j.status = 'running' AND j.locked_by = p_worker;
  RETURN FOUND;
END;
$$;

-- Falhou: volta para a fila com atraso ou, sem tentativas restantes, fica `failed`. Só o código do erro.
CREATE FUNCTION app.jobs_fail(p_id uuid, p_worker text, p_error_code text, p_retry_seconds integer)
  RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_code text := CASE WHEN p_error_code ~ '^[A-Za-z0-9_.:-]{1,64}$' THEN p_error_code ELSE 'unknown' END;
BEGIN
  UPDATE public.job_queue j
     SET status = 'failed', last_error_code = v_code, locked_until = NULL, locked_by = NULL,
         updated_at = now()
   WHERE j.id = p_id AND j.status = 'running' AND j.locked_by = p_worker
     AND j.attempts >= j.max_attempts;
  IF FOUND THEN
    RETURN true;
  END IF;
  BEGIN
    UPDATE public.job_queue j
       SET status = 'queued', last_error_code = v_code, locked_until = NULL, locked_by = NULL,
           run_at = now() + make_interval(secs => greatest(p_retry_seconds, 1)), updated_at = now()
     WHERE j.id = p_id AND j.status = 'running' AND j.locked_by = p_worker;
  EXCEPTION WHEN unique_violation THEN
    -- Já existe outro job na fila com a mesma chave: este sai.
    DELETE FROM public.job_queue j WHERE j.id = p_id;
  END;
  RETURN FOUND;
END;
$$;

-- Cancela o job ainda não iniciado de uma chave (ex.: reconsentimento cancela a eliminação agendada).
CREATE FUNCTION app.jobs_cancel(p_singleton_key text) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM public.job_queue j WHERE j.singleton_key = p_singleton_key AND j.status = 'queued';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  app.consent_records_guard(),
  app.policy_acceptances_guard(),
  app.has_active_consent(public.consent_purpose),
  app.audit_append(public.audit_action, public.audit_resource_type, uuid, boolean),
  app.access_log_append(text),
  app.account_close_minor(),
  app.privacy_purge_access_logs(integer),
  app.privacy_purge_proofs(integer),
  app.privacy_due_health_eliminations(integer),
  app.jobs_enqueue(text, jsonb, timestamptz, integer, text),
  app.jobs_claim(text, text[], integer, integer),
  app.jobs_complete(uuid, text),
  app.jobs_fail(uuid, text, text, integer),
  app.jobs_cancel(text)
TO app_user;

-- ---------- Versões publicadas (v1) ----------
-- Hash = SHA-256 do texto do catálogo i18n (src/modules/consent/catalog.ts; teste confere os dois).
-- Nova versão = nova migração com INSERT, nunca UPDATE (as provas apontam para a versão antiga).
INSERT INTO public.policy_versions (id, document, version, text_hash, requires_reconsent, published_at, updated_at)
VALUES
  (gen_random_uuid(), 'privacy_policy', 1, 'f198b78b0a2b2a51680e27959b1b4532efa8aca526b94baed48ccdeb40edbf2d', true, '2026-10-07T00:00:00Z', now()),
  (gen_random_uuid(), 'terms', 1, '705838b552199e7dfe1a5f0b8d996b8b0e03369ddbe82db54de9d6b88cc4121f', true, '2026-10-07T00:00:00Z', now()),
  (gen_random_uuid(), 'consent_health_data', 1, 'fe50c48f529e3a89039643e6da334c979499805fdc101a22a2029cd54d12f39e', true, '2026-10-07T00:00:00Z', now()),
  (gen_random_uuid(), 'consent_marketing', 1, 'cfd5bfb2754bc8e9cb7d61dad354b7e7e0c84dca3add64efe6821a5f337e5f6f', true, '2026-10-07T00:00:00Z', now()),
  (gen_random_uuid(), 'consent_product_metrics', 1, '6421c1d9f76c0656b69e7121ea80a49f1b992ed9ddc8dc509ef71df2dc4d95eb', true, '2026-10-07T00:00:00Z', now());
