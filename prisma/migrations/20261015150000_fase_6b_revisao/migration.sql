-- Revisão de privacidade da Fase 6b (ADR-0034). Escrito à mão.
-- M2: excluir a conta encerra a carência e para os pedidos de exportação na fila ou em geração; conta excluída
--     nunca está na carência (defesa em profundidade).
-- B4: a purga conclui só o pedido de exclusão; os outros abertos saem como recusados.

CREATE OR REPLACE FUNCTION app.account_delete(p_proof_hash bytea) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_user uuid := app.current_user_id();
  v_request uuid := gen_random_uuid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'account deletion requires user context' USING ERRCODE = '42501';
  END IF;
  UPDATE public.reauth_proofs r SET used_at = now(), updated_at = now()
   WHERE r.user_id = v_user AND r.purpose = 'account_deletion' AND r.token_hash = p_proof_hash
     AND r.used_at IS NULL AND r.expires_at > now();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reauthentication required' USING ERRCODE = '42501';
  END IF;
  -- Sem carência depois da exclusão (revisão M2): nada mais é lido para exportação.
  UPDATE public.users u SET deleted_at = now(), health_data_purge_at = NULL, updated_at = now()
   WHERE u.id = v_user AND u.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'account not found' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.sessions s SET revoked_at = now(), updated_at = now()
   WHERE s.user_id = v_user AND s.revoked_at IS NULL;
  UPDATE public.auth_tokens t SET used_at = now(), updated_at = now()
   WHERE t.user_id = v_user AND t.used_at IS NULL;
  UPDATE public.consent_records c SET revoked_at = now(), updated_at = now()
   WHERE c.user_id = v_user AND c.revoked_at IS NULL;
  -- Links vencem na hora e pedidos na fila ou em geração param (revisão M2); os arquivos saem na purga.
  UPDATE public.data_export_jobs j
     SET status = 'expired', expires_at = least(coalesce(j.expires_at, now()), now()), updated_at = now()
   WHERE j.user_id = v_user AND j.status IN ('queued', 'processing', 'ready');
  INSERT INTO public.privacy_requests (id, user_id, kind, status, due_at, created_at, updated_at)
  VALUES (v_request, v_user, 'deletion', 'in_progress', now() + interval '15 days', now(), now());
  INSERT INTO public.audit_logs (id, actor_user_id, subject_user_id, action, resource_type, resource_id,
                                 created_at, updated_at)
  VALUES (gen_random_uuid(), v_user, v_user, 'account_deletion_requested', 'privacy_request', v_request,
          now(), now()),
         (gen_random_uuid(), NULL, v_user, 'account_deleted', 'user', NULL, now(), now());
  RETURN v_request;
END;
$$;

CREATE OR REPLACE FUNCTION app.account_purge() RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_user uuid := app.current_user_id();
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'account purge requires user context' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.users u WHERE u.id = v_user AND u.deleted_at IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  -- Só o pedido de exclusão foi atendido; os demais perdem o objeto e saem como recusados, sem dizer que foram
  -- atendidos (revisão B4, OI-33).
  FOR v_id IN
    UPDATE public.privacy_requests r
       SET status = CASE WHEN r.kind = 'deletion' THEN 'completed'::public.privacy_request_status
                         ELSE 'rejected'::public.privacy_request_status END,
           closed_at = now(), updated_at = now()
     WHERE r.user_id = v_user AND r.status IN ('open', 'in_progress')
    RETURNING r.id
  LOOP
    INSERT INTO public.audit_logs (id, actor_user_id, subject_user_id, action, resource_type, resource_id,
                                   created_at, updated_at)
    VALUES (gen_random_uuid(), NULL, v_user, 'privacy_request_closed', 'privacy_request', v_id, now(), now());
  END LOOP;
  INSERT INTO public.audit_logs (id, actor_user_id, subject_user_id, action, resource_type, resource_id,
                                 created_at, updated_at)
  VALUES (gen_random_uuid(), NULL, v_user, 'account_purged', 'user', NULL, now(), now());
  DELETE FROM public.users u WHERE u.id = v_user;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION app.health_grace_active() RETURNS boolean
  LANGUAGE sql STABLE
  SET search_path = pg_catalog, pg_temp
AS $$
  SELECT EXISTS (
           SELECT 1 FROM public.users u
            WHERE u.id = app.current_user_id() AND u.health_data_purge_at > now()
              AND u.deleted_at IS NULL)
     AND NOT app.has_active_consent('health_data');
$$;
