-- AlterEnum
ALTER TYPE "audit_action" ADD VALUE 'onboarding_expiry_notice_sent';
ALTER TYPE "audit_action" ADD VALUE 'account_expired_onboarding';
ALTER TYPE "audit_action" ADD VALUE 'privacy_request_registered';

-- AlterTable
ALTER TABLE "users" ADD COLUMN "onboarding_expiry_notice_at" TIMESTAMPTZ(3);
ALTER TABLE "audit_logs" ADD COLUMN "operator_role" TEXT;

-- =====================================================================================================
-- Escrito à mão (ADR-0037; LEG-D04, LEG-D07, LEG-F04, LEG-R*, LEG-S06). Direitos da 7b.
-- Mesmas regras da ADR-0015: SECURITY DEFINER com search_path fixo, objetos qualificados, sem SQL dinâmico,
-- retorno mínimo. Os valores novos de `audit_action` só aparecem em corpos plpgsql.
--   P7-M2: conta verificada que não conclui o onboarding sai em 30 dias, com aviso por e-mail 7 dias antes.
--   P7-M2 / OI-34: o encarregado registra um pedido recebido fora do app e, na exclusão e no encerramento de
--     menor, corta o acesso; cada ato grava o papel de login da pessoa que atendeu (`operator_role`).
--   D4 / PR1b-R2-M1: acima do teto de encerramentos, o encerramento de menor vira pedido pendente (acesso
--     cortado na hora, purga pelo job), sem bloquear quem se declarou menor.
-- =====================================================================================================

-- Só o papel de login de quem atende (nome técnico, sem e-mail): `operador_<nome>`.
ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_operator_role CHECK (operator_role IS NULL OR operator_role ~ '^[a-z0-9_]{1,63}$');

-- ---------- P7-M2: contas sem onboarding ----------
-- Aviso (job diário `privacy.onboarding_expiry`, papel app_worker): verificadas, não excluídas, sem onboarding,
-- criadas há 23 dias ou mais e ainda sem aviso. `purge_after`: a data mínima da exclusão que o e-mail informa.
CREATE FUNCTION app.onboarding_expiry_notices_due(p_limit integer)
  RETURNS TABLE (user_id uuid, purge_after timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
  SELECT u.id, greatest(u.created_at + interval '30 days', now() + interval '7 days')
    FROM public.users u
   WHERE u.email_verified_at IS NOT NULL AND u.deleted_at IS NULL AND u.onboarding_completed_at IS NULL
     AND u.onboarding_expiry_notice_at IS NULL AND u.created_at <= now() - interval '23 days'
   ORDER BY u.created_at
   LIMIT least(greatest(p_limit, 1), 1000);
$$;

-- Depois do envio, no contexto da pessoa: marca o aviso e grava o AuditLog (sem ator, só IDs). Só quem ainda
-- está na condição; envio que falhou não marca, e a exclusão espera o aviso.
CREATE FUNCTION app.onboarding_expiry_notice_mark() RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_user uuid := app.current_user_id();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'notice requires user context' USING ERRCODE = '42501';
  END IF;
  UPDATE public.users u SET onboarding_expiry_notice_at = now(), updated_at = now()
   WHERE u.id = v_user AND u.deleted_at IS NULL AND u.onboarding_completed_at IS NULL
     AND u.onboarding_expiry_notice_at IS NULL;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  INSERT INTO public.audit_logs (id, actor_user_id, subject_user_id, action, resource_type, resource_id,
                                 created_at, updated_at)
  VALUES (gen_random_uuid(), NULL, v_user, 'onboarding_expiry_notice_sent', 'user', NULL, now(), now());
  RETURN true;
END;
$$;

-- Exclusão: 30 dias depois do cadastro E 7 dias depois do aviso (um aviso atrasado adia a exclusão; sem aviso,
-- nada sai). Nada fora do banco: sem onboarding não há consentimento, nem registro, nem exportação. A linha
-- do AuditLog não leva pessoa nem recurso (sem dado pessoal): só o fato e a data. As sessões, os tokens e os
-- jobs saem junto. `FOR UPDATE SKIP LOCKED`: quem está concluindo o onboarding agora não é apagado.
CREATE FUNCTION app.onboarding_expired_purge(p_limit integer) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_count integer := 0;
BEGIN
  FOR v_id IN
    SELECT u.id FROM public.users u
     WHERE u.email_verified_at IS NOT NULL AND u.deleted_at IS NULL AND u.onboarding_completed_at IS NULL
       AND u.created_at < now() - interval '30 days'
       AND u.onboarding_expiry_notice_at <= now() - interval '7 days'
     ORDER BY u.created_at
     LIMIT least(greatest(p_limit, 1), 1000)
     FOR UPDATE SKIP LOCKED
  LOOP
    DELETE FROM public.job_queue q WHERE q.payload ->> 'userId' = v_id::text AND q.status <> 'running';
    DELETE FROM public.users u WHERE u.id = v_id AND u.onboarding_completed_at IS NULL;
    IF FOUND THEN
      INSERT INTO public.audit_logs (id, actor_user_id, subject_user_id, action, resource_type, resource_id,
                                     created_at, updated_at)
      VALUES (gen_random_uuid(), NULL, NULL, 'account_expired_onboarding', 'user', NULL, now(), now());
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

-- ---------- D4: encerramento de menor sem bloqueio ----------
-- Abaixo do teto (50 por hora): como antes, a conta sai na hora (a aplicação apaga os arquivos na mesma
-- transação). Acima: o acesso é cortado na hora (deleted_at, sessões, tokens, consentimentos, links) e o
-- pedido `minor_closure` fica em andamento; a purga roda no job (`privacy.account_purge_sweep`, de hora em
-- hora), que apaga arquivos, dados e a conta. Devolve o pedido e se ficou pendente.
DROP FUNCTION app.account_close_minor(bytea);

CREATE FUNCTION app.account_close_minor(p_proof_hash bytea)
  RETURNS TABLE (request_id uuid, pending boolean)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_user uuid := app.current_user_id();
  v_request uuid := gen_random_uuid();
  v_pending boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'account closure requires user context' USING ERRCODE = '42501';
  END IF;
  UPDATE public.reauth_proofs r SET used_at = now(), updated_at = now()
   WHERE r.user_id = v_user AND r.purpose = 'minor_closure' AND r.token_hash = p_proof_hash
     AND r.used_at IS NULL AND r.expires_at > now();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reauthentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_user AND u.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'account not found' USING ERRCODE = 'P0002';
  END IF;
  v_pending := (SELECT count(*) FROM public.audit_logs a
                 WHERE a.action = 'account_closed_minor' AND a.created_at > now() - interval '1 hour') >= 50;

  INSERT INTO public.privacy_requests (id, user_id, kind, status, due_at, closed_at, created_at, updated_at)
  VALUES (v_request, v_user, 'minor_closure',
          CASE WHEN v_pending THEN 'in_progress'::public.privacy_request_status
               ELSE 'completed'::public.privacy_request_status END,
          CASE WHEN v_pending THEN now() + interval '1 day' ELSE now() END,
          CASE WHEN v_pending THEN NULL ELSE now() END, now(), now());
  UPDATE public.consent_records c SET revoked_at = now(), updated_at = now()
   WHERE c.user_id = v_user AND c.revoked_at IS NULL;
  INSERT INTO public.audit_logs (id, actor_user_id, subject_user_id, action, resource_type, resource_id,
                                 created_at, updated_at)
  VALUES (gen_random_uuid(), v_user, v_user, 'privacy_request_created', 'privacy_request', v_request,
          now(), now()),
         (gen_random_uuid(), v_user, v_user, 'account_closed_minor', 'user', NULL, now(), now());

  IF v_pending THEN
    UPDATE public.users u SET deleted_at = now(), health_data_purge_at = NULL, updated_at = now()
     WHERE u.id = v_user;
    UPDATE public.sessions s SET revoked_at = now(), updated_at = now()
     WHERE s.user_id = v_user AND s.revoked_at IS NULL;
    UPDATE public.auth_tokens t SET used_at = now(), updated_at = now()
     WHERE t.user_id = v_user AND t.used_at IS NULL;
    UPDATE public.data_export_jobs j
       SET status = 'expired', expires_at = least(coalesce(j.expires_at, now()), now()), updated_at = now()
     WHERE j.user_id = v_user AND j.status IN ('queued', 'processing', 'ready');
  ELSE
    DELETE FROM public.job_queue q WHERE q.payload ->> 'userId' = v_user::text AND q.status <> 'running';
    DELETE FROM public.users u WHERE u.id = v_user;
  END IF;
  RETURN QUERY SELECT v_request, v_pending;
END;
$$;

-- ---------- Atendimento manual (grupo app_operator; cada pessoa com o próprio papel de login) ----------
-- O papel de login de quem atende, para o AuditLog. Recusa quem não pertence ao grupo.
CREATE FUNCTION app.operator_role() RETURNS text
  LANGUAGE plpgsql STABLE
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_role text := session_user::text;
BEGIN
  IF v_role !~ '^[a-z0-9_]{1,63}$' OR NOT pg_has_role(session_user, 'app_operator', 'MEMBER') THEN
    RAISE EXCEPTION 'operator role required' USING ERRCODE = '42501';
  END IF;
  RETURN v_role;
END;
$$;

-- Pedido recebido fora do app (e-mail ao encarregado, carta): o encarregado confere a identidade fora do
-- sistema e registra aqui. Conta ativa pelo e-mail; sem conta, NULL (nada é gravado). `p_received_at`: quando
-- o pedido chegou (até 15 dias antes), base do prazo de 15 dias. Idempotente com pedido aberto do mesmo tipo.
CREATE FUNCTION app.operator_request_register(p_email text, p_kind public.privacy_request_kind,
                                              p_received_at timestamptz)
  RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_operator text := app.operator_role();
  v_user uuid;
  v_id uuid;
BEGIN
  IF p_kind IS NULL OR p_received_at IS NULL OR p_received_at > now() + interval '5 minutes'
     OR p_received_at < now() - interval '15 days' OR p_email IS NULL OR length(p_email) > 320 THEN
    RAISE EXCEPTION 'invalid request arguments' USING ERRCODE = '22023';
  END IF;
  SELECT u.id INTO v_user FROM public.users u
   WHERE u.email = lower(btrim(p_email)) AND u.deleted_at IS NULL;
  IF v_user IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('privacy.request'), hashtext(v_user::text));
  SELECT r.id INTO v_id FROM public.privacy_requests r
   WHERE r.user_id = v_user AND r.kind = p_kind AND r.status IN ('open', 'in_progress')
   ORDER BY r.created_at DESC LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;
  v_id := gen_random_uuid();
  INSERT INTO public.privacy_requests (id, user_id, kind, status, due_at, created_at, updated_at)
  VALUES (v_id, v_user, p_kind, 'open', least(p_received_at, now()) + interval '15 days', now(), now());
  INSERT INTO public.audit_logs (id, actor_user_id, subject_user_id, action, resource_type, resource_id,
                                 operator_role, created_at, updated_at)
  VALUES (gen_random_uuid(), NULL, v_user, 'privacy_request_registered', 'privacy_request', v_id, v_operator,
          now(), now());
  RETURN v_id;
END;
$$;

-- Exclusão ou encerramento de menor pedido fora do app, depois de conferida a identidade: corta o acesso na
-- hora, como `account_delete`, e deixa o pedido em andamento; a purga (arquivos, dados e conta) roda no job
-- de hora em hora. Sem e-mail automático: o encarregado responde pelo canal em que recebeu o pedido.
CREATE FUNCTION app.operator_account_delete(p_request_id uuid) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_operator text := app.operator_role();
  v_user uuid;
BEGIN
  UPDATE public.privacy_requests r SET status = 'in_progress', updated_at = now()
   WHERE r.id = p_request_id AND r.status IN ('open', 'in_progress')
     AND r.kind::text IN ('deletion', 'minor_closure')
  RETURNING r.user_id INTO v_user;
  IF v_user IS NULL THEN
    RETURN false;
  END IF;
  UPDATE public.users u SET deleted_at = now(), health_data_purge_at = NULL, updated_at = now()
   WHERE u.id = v_user AND u.deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  UPDATE public.sessions s SET revoked_at = now(), updated_at = now()
   WHERE s.user_id = v_user AND s.revoked_at IS NULL;
  UPDATE public.auth_tokens t SET used_at = now(), updated_at = now()
   WHERE t.user_id = v_user AND t.used_at IS NULL;
  UPDATE public.consent_records c SET revoked_at = now(), updated_at = now()
   WHERE c.user_id = v_user AND c.revoked_at IS NULL;
  UPDATE public.data_export_jobs j
     SET status = 'expired', expires_at = least(coalesce(j.expires_at, now()), now()), updated_at = now()
   WHERE j.user_id = v_user AND j.status IN ('queued', 'processing', 'ready');
  INSERT INTO public.audit_logs (id, actor_user_id, subject_user_id, action, resource_type, resource_id,
                                 operator_role, created_at, updated_at)
  VALUES (gen_random_uuid(), NULL, v_user, 'account_deleted', 'privacy_request', p_request_id, v_operator,
          now(), now());
  RETURN true;
END;
$$;

-- As três funções da 6b passam a gravar quem atendeu; a leitura do contato tem teto de 30 por hora por pessoa
-- que atende (OI-34 b).
CREATE OR REPLACE FUNCTION app.operator_request_contact(p_id uuid) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_operator text := app.operator_role();
  v_user uuid;
  v_email text;
BEGIN
  SELECT r.user_id INTO v_user FROM public.privacy_requests r
   WHERE r.id = p_id AND r.status IN ('open', 'in_progress');
  IF v_user IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT u.email INTO v_email FROM public.users u WHERE u.id = v_user AND u.deleted_at IS NULL;
  IF v_email IS NULL THEN
    RETURN NULL;
  END IF;
  IF (SELECT count(*) FROM public.audit_logs a
       WHERE a.action = 'privacy_request_contact_read' AND a.operator_role = v_operator
         AND a.created_at > now() - interval '1 hour') >= 30 THEN
    RAISE EXCEPTION 'contact read rate exceeded' USING ERRCODE = '54000';
  END IF;
  INSERT INTO public.audit_logs (id, actor_user_id, subject_user_id, action, resource_type, resource_id,
                                 operator_role, created_at, updated_at)
  VALUES (gen_random_uuid(), NULL, v_user, 'privacy_request_contact_read', 'privacy_request', p_id, v_operator,
          now(), now());
  RETURN v_email;
END;
$$;

CREATE OR REPLACE FUNCTION app.operator_request_close(p_id uuid, p_status public.privacy_request_status)
  RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_operator text := app.operator_role();
  v_user uuid;
BEGIN
  IF p_status IS NULL OR p_status::text NOT IN ('completed', 'rejected') THEN
    RAISE EXCEPTION 'invalid status' USING ERRCODE = '22023';
  END IF;
  -- Exclusão e encerramento são concluídos pela purga; o encarregado só pode recusar os que ainda não
  -- cortaram o acesso (ex.: identidade não confirmada).
  UPDATE public.privacy_requests r SET status = p_status, closed_at = now(), updated_at = now()
   WHERE r.id = p_id AND r.status IN ('open', 'in_progress')
     AND (r.kind::text NOT IN ('deletion', 'minor_closure')
          OR (p_status = 'rejected' AND r.status = 'open'))
  RETURNING r.user_id INTO v_user;
  IF v_user IS NULL THEN
    RETURN false;
  END IF;
  INSERT INTO public.audit_logs (id, actor_user_id, subject_user_id, action, resource_type, resource_id,
                                 operator_role, created_at, updated_at)
  VALUES (gen_random_uuid(), NULL, v_user, 'privacy_request_closed', 'privacy_request', p_id, v_operator,
          now(), now());
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION app.operator_requests_due()
  RETURNS TABLE (request_id uuid, kind public.privacy_request_kind, status public.privacy_request_status,
                 opened_at timestamptz, due timestamptz)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM app.operator_role();
  RETURN QUERY
    SELECT r.id, r.kind, r.status, r.created_at, r.due_at
      FROM public.privacy_requests r
     WHERE r.status IN ('open', 'in_progress')
     ORDER BY r.due_at, r.id
     LIMIT 500;
END;
$$;

-- ---------- Privilégios ----------
REVOKE EXECUTE ON FUNCTION
  app.onboarding_expiry_notices_due(integer),
  app.onboarding_expiry_notice_mark(),
  app.onboarding_expired_purge(integer),
  app.account_close_minor(bytea),
  app.operator_role(),
  app.operator_request_register(text, public.privacy_request_kind, timestamptz),
  app.operator_account_delete(uuid)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  app.onboarding_expiry_notices_due(integer),
  app.onboarding_expiry_notice_mark(),
  app.onboarding_expired_purge(integer)
TO app_worker;
GRANT EXECUTE ON FUNCTION app.account_close_minor(bytea) TO app_user;
GRANT EXECUTE ON FUNCTION
  app.operator_role(),
  app.operator_request_register(text, public.privacy_request_kind, timestamptz),
  app.operator_account_delete(uuid)
TO app_operator;
