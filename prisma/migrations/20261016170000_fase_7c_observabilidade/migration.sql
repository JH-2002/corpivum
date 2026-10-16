-- =====================================================================================================
-- Escrito à mão (ADR-0038; LEG-R04, LEG-S03, LEG-S06). Mesmas regras da ADR-0015: SECURITY DEFINER com
-- search_path fixo, objetos qualificados, sem SQL dinâmico, retorno mínimo.
--   P7-M1: amostra de hora em hora do volume de leitura das tabelas de saúde, para o alerta de volume anômalo.
--   7b-R3: a consulta do encarregado que não abre pedido (e-mail sem conta, ou pedido já aberto) deixa rastro.
-- =====================================================================================================

ALTER TYPE "audit_action" ADD VALUE 'privacy_request_lookup';

-- ---------- P7-M1 ----------
-- Totais acumulados de tuplas lidas (sequencial + índice) das tabelas de saúde, um por amostra. Só números e
-- horários: nenhuma pessoa, nenhum conteúdo. Fora do schema public (o Prisma não a gerencia) e sem acesso para
-- app_user, app_worker ou operador: só a função abaixo, como dona, lê e grava.
CREATE TABLE app.read_volume_samples (
  sampled_at   timestamptz PRIMARY KEY,
  tuples_total bigint      NOT NULL CHECK (tuples_total >= 0)
);
REVOKE ALL ON app.read_volume_samples FROM PUBLIC, app_user, app_worker, app_operator;
ALTER TABLE app.read_volume_samples ENABLE ROW LEVEL SECURITY;

-- Contadores do próprio Postgres (`pg_stat_user_tables`), que o runtime não zera nem altera: código que execute
-- como `app_user` e leia os dados de muitas contas (P7-M1) aparece aqui mesmo sem passar pelo app. Devolve, desde
-- a amostra anterior: tuplas lidas, pessoas com sessão usada no período (`last_seen_at` é tocado a cada 5 min),
-- a duração em minutos e o maior número de ações de um mesmo papel de operador no AuditLog (7b-R3). Na primeira
-- amostra não devolve linha. Contador zerado (reinício das estatísticas) conta do zero.
CREATE FUNCTION app.security_volume_sample()
  RETURNS TABLE (tuples_read bigint, active_users integer, window_minutes integer,
                 operator_actions_max integer)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_total bigint;
  v_prev_at timestamptz;
  v_prev_total bigint;
BEGIN
  LOCK TABLE app.read_volume_samples IN SHARE ROW EXCLUSIVE MODE;
  SELECT coalesce(sum(coalesce(s.seq_tup_read, 0) + coalesce(s.idx_tup_fetch, 0)), 0)::bigint
    INTO v_total
    FROM pg_catalog.pg_stat_user_tables s
   WHERE s.schemaname = 'public'
     AND s.relname = ANY (ARRAY['body_measurements', 'sleep_entries', 'habits', 'habit_checks',
                                'meal_entries', 'water_entries', 'activity_entries', 'strength_sets',
                                'goals', 'reminders']);
  SELECT r.sampled_at, r.tuples_total INTO v_prev_at, v_prev_total
    FROM app.read_volume_samples r ORDER BY r.sampled_at DESC LIMIT 1;
  INSERT INTO app.read_volume_samples (sampled_at, tuples_total) VALUES (v_now, v_total);
  DELETE FROM app.read_volume_samples r WHERE r.sampled_at < v_now - interval '7 days';
  IF v_prev_at IS NULL THEN
    RETURN;
  END IF;
  tuples_read := CASE WHEN v_total >= v_prev_total THEN v_total - v_prev_total ELSE v_total END;
  window_minutes := greatest(1, ceil(extract(epoch FROM v_now - v_prev_at) / 60))::integer;
  SELECT count(DISTINCT se.user_id)::integer INTO active_users
    FROM public.sessions se
   WHERE se.last_seen_at >= v_prev_at - interval '5 minutes';
  SELECT coalesce(max(x.n), 0)::integer INTO operator_actions_max
    FROM (SELECT count(*) AS n FROM public.audit_logs a
           WHERE a.operator_role IS NOT NULL AND a.created_at >= v_prev_at
           GROUP BY a.operator_role) x;
  RETURN NEXT;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.security_volume_sample() FROM PUBLIC, app_user;
GRANT EXECUTE ON FUNCTION app.security_volume_sample() TO app_worker;

-- ---------- 7b-R3 ----------
-- Igual à da 7b, mais o AuditLog `privacy_request_lookup` nos dois caminhos que não abrem pedido: e-mail sem
-- conta (sem pessoa nem recurso) e pedido do mesmo tipo já aberto (pessoa e pedido). Só o papel de quem consultou;
-- nunca o e-mail. Entra na contagem por operador do alerta de volume.
CREATE OR REPLACE FUNCTION app.operator_request_register(p_email text, p_kind public.privacy_request_kind,
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
    INSERT INTO public.audit_logs (id, actor_user_id, subject_user_id, action, resource_type, resource_id,
                                   operator_role, created_at, updated_at)
    VALUES (gen_random_uuid(), NULL, NULL, 'privacy_request_lookup', 'privacy_request', NULL, v_operator,
            now(), now());
    RETURN NULL;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('privacy.request'), hashtext(v_user::text));
  SELECT r.id INTO v_id FROM public.privacy_requests r
   WHERE r.user_id = v_user AND r.kind = p_kind AND r.status IN ('open', 'in_progress')
   ORDER BY r.created_at DESC LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO public.audit_logs (id, actor_user_id, subject_user_id, action, resource_type, resource_id,
                                   operator_role, created_at, updated_at)
    VALUES (gen_random_uuid(), NULL, v_user, 'privacy_request_lookup', 'privacy_request', v_id, v_operator,
            now(), now());
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
