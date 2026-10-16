-- =====================================================================================================
-- Escrito à mão (ADR-0037, revisão do privacy-reviewer da 7b; LEG-D03, LEG-D04, LEG-D07, LEG-S03).
-- Mesmas regras da ADR-0015: SECURITY DEFINER com search_path fixo, objetos qualificados, sem SQL dinâmico,
-- retorno mínimo.
--   7b-B3: a expiração de contas sem onboarding pula quem tem pedido do titular aberto.
--   7b-B4: os prazos contam exclusões e encerramentos em andamento há mais de 1 hora (purga parada).
--   7b-B5: `exports_mark_file_deleted` só marca exportação da pessoa do contexto.
-- =====================================================================================================

-- ---------- 7b-B3 ----------
-- Pedido aberto (ex.: acesso registrado pelo encarregado) segura a exclusão automática: o pedido é atendido
-- antes, e a conta sai na execução seguinte ao fechamento. Os vencidos aparecem na contagem de prazos.
CREATE OR REPLACE FUNCTION app.onboarding_expired_purge(p_limit integer) RETURNS integer
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
       AND NOT EXISTS (SELECT 1 FROM public.privacy_requests r
                        WHERE r.user_id = u.id AND r.status IN ('open', 'in_progress'))
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

-- ---------- 7b-B4 ----------
-- `stalled_closures`: exclusões e encerramentos de menor com o acesso cortado e a purga ainda não feita há mais
-- de 1 hora (a tela promete "em até 1 hora"). Só a contagem; o runbook diz como reenfileirar.
DROP FUNCTION app.privacy_request_deadlines();
CREATE FUNCTION app.privacy_request_deadlines()
  RETURNS TABLE (due_soon integer, overdue integer, stalled_closures integer)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
  SELECT count(*) FILTER (WHERE r.due_at >= now() AND r.due_at < now() + interval '3 days')::int,
         count(*) FILTER (WHERE r.due_at < now())::int,
         count(*) FILTER (WHERE r.status = 'in_progress' AND r.kind::text IN ('deletion', 'minor_closure')
                            AND r.updated_at < now() - interval '1 hour')::int
    FROM public.privacy_requests r
   WHERE r.status IN ('open', 'in_progress');
$$;
REVOKE EXECUTE ON FUNCTION app.privacy_request_deadlines() FROM PUBLIC, app_user;
GRANT EXECUTE ON FUNCTION app.privacy_request_deadlines() TO app_worker;

-- ---------- 7b-B5 ----------
-- Só a exportação da pessoa do contexto: o runtime não marca como apagado (sem apagar) o arquivo de outra conta.
CREATE OR REPLACE FUNCTION app.exports_mark_file_deleted(p_id uuid) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_user uuid := app.current_user_id();
  v_count integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'export cleanup requires user context' USING ERRCODE = '42501';
  END IF;
  UPDATE public.data_export_jobs j
     SET status = 'expired', file_deleted_at = now(),
         expires_at = least(coalesce(j.expires_at, now()), now()), updated_at = now()
   WHERE j.id = p_id AND j.user_id = v_user AND j.file_deleted_at IS NULL
     AND ((j.status = 'ready' AND j.expires_at <= now())
       OR j.status IN ('expired', 'failed')
       OR (j.status IN ('queued', 'processing') AND j.updated_at < now() - interval '1 hour'));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;
