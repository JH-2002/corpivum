-- Revisão de privacidade da Fase 2 (ADR-0021, achado B1): o pedido de revisão do Índice era "SELECT e depois
-- INSERT" sem trava; duas chamadas concorrentes criavam dois pedidos abertos. Agora a função serializa por
-- pessoa com trava de transação (sem índice novo). Mesmas regras da ADR-0015 para SECURITY DEFINER.
CREATE OR REPLACE FUNCTION app.privacy_request_score_review(p_score_version smallint, p_period_start date,
                                                 p_period_end date)
  RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_user uuid := app.current_user_id();
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'review requires user context' USING ERRCODE = '42501';
  END IF;
  IF p_score_version IS NULL OR p_score_version < 1 OR p_period_start IS NULL OR p_period_end IS NULL
     OR p_period_start > p_period_end OR p_period_end - p_period_start > 400 THEN
    RAISE EXCEPTION 'invalid review scope' USING ERRCODE = '22023';
  END IF;
  -- Serializa pedidos da mesma pessoa: duplo clique ou duas abas não criam dois pedidos abertos.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('score-review:' || v_user::text, 0));
  SELECT r.id INTO v_id FROM public.privacy_requests r
   WHERE r.user_id = v_user AND r.kind = 'automated_review' AND r.status IN ('open', 'in_progress')
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;
  INSERT INTO public.privacy_requests (id, user_id, kind, status, due_at, score_version, period_start,
                                       period_end, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user, 'automated_review', 'open', now() + interval '15 days',
          p_score_version, p_period_start, p_period_end, now(), now())
  RETURNING id INTO v_id;
  INSERT INTO public.audit_logs (id, actor_user_id, subject_user_id, action, resource_type, resource_id,
                                 created_at, updated_at)
  VALUES (gen_random_uuid(), v_user, v_user, 'privacy_request_created', 'privacy_request', v_id, now(), now());
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION app.privacy_request_score_review(smallint, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.privacy_request_score_review(smallint, date, date) TO app_user;
