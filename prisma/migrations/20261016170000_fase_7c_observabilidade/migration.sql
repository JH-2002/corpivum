-- =====================================================================================================
-- Escrito à mão (ADR-0038; LEG-R04, LEG-S03, LEG-S06). Mesmas regras da ADR-0015: SECURITY DEFINER com
-- search_path fixo, objetos qualificados, sem SQL dinâmico, retorno mínimo.
--   P7-M1: amostra de hora em hora do volume de leitura das tabelas de saúde e de identidade, para o alerta de
--          volume anômalo.
--   7b-R3: a consulta do encarregado que não abre pedido (e-mail sem conta, ou pedido já aberto) deixa rastro.
-- =====================================================================================================

ALTER TYPE "audit_action" ADD VALUE 'privacy_request_lookup';

-- ---------- P7-M1 ----------
-- Totais acumulados de tuplas lidas (sequencial + índice) das tabelas monitoradas, um por amostra. Só números e
-- horários: nenhuma pessoa, nenhum conteúdo. Fora do schema public (o Prisma não a gerencia) e sem acesso para
-- app_user, app_worker ou operador: só a função abaixo, como dona, lê e grava (8 dias).
CREATE TABLE app.read_volume_samples (
  sampled_at   timestamptz PRIMARY KEY,
  tuples_total bigint      NOT NULL CHECK (tuples_total >= 0)
);
REVOKE ALL ON app.read_volume_samples FROM PUBLIC, app_user, app_worker, app_operator;
ALTER TABLE app.read_volume_samples ENABLE ROW LEVEL SECURITY;

-- Contadores do próprio Postgres (`pg_stat_user_tables`/`pg_stat_user_indexes`), que o runtime não zera nem altera:
-- código que execute como `app_user` e leia os dados de muitas contas (P7-M1) aparece aqui mesmo sem passar pelo
-- app. Tabelas de saúde, `users` e `consent_records`; tuplas lidas por varredura e entradas de índice lidas (conta
-- também a varredura só pelo índice).
-- Revisão da 7c (A1, M1): nada que o runtime grava entra no teto (nem `sessions.last_seen_at`). O período é de
-- relógio: a amostra atual contra a mais recente com pelo menos 55 minutos, então chamadas extras no meio não
-- "gastam" o delta. A linha de base é a mediana das taxas por hora entre amostras consecutivas (intervalo ≥ 30 min)
-- dos 7 dias anteriores ao período; NULL com menos de 24 taxas. Sem amostra de 55 minutos atrás, não devolve linha.
-- Devolve também o maior número de ações de um mesmo papel de operador no AuditLog no período (7b-R3).
CREATE FUNCTION app.security_volume_sample()
  RETURNS TABLE (tuples_read bigint, window_minutes integer, baseline_per_hour bigint,
                 operator_actions_max integer)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_tables text[] := ARRAY['body_measurements', 'sleep_entries', 'habits', 'habit_checks', 'meal_entries',
                           'water_entries', 'activity_entries', 'strength_sets', 'goals', 'reminders',
                           'users', 'consent_records'];
  v_total bigint;
  v_prev_at timestamptz;
  v_prev_total bigint;
BEGIN
  LOCK TABLE app.read_volume_samples IN SHARE ROW EXCLUSIVE MODE;
  SELECT coalesce((SELECT sum(coalesce(t.seq_tup_read, 0)) FROM pg_catalog.pg_stat_user_tables t
                    WHERE t.schemaname = 'public' AND t.relname = ANY (v_tables)), 0)::bigint
       + coalesce((SELECT sum(coalesce(i.idx_tup_read, 0)) FROM pg_catalog.pg_stat_user_indexes i
                    WHERE i.schemaname = 'public' AND i.relname = ANY (v_tables)), 0)::bigint
    INTO v_total;
  SELECT r.sampled_at, r.tuples_total INTO v_prev_at, v_prev_total
    FROM app.read_volume_samples r
   WHERE r.sampled_at <= v_now - interval '55 minutes'
   ORDER BY r.sampled_at DESC LIMIT 1;
  INSERT INTO app.read_volume_samples (sampled_at, tuples_total) VALUES (v_now, v_total);
  DELETE FROM app.read_volume_samples r WHERE r.sampled_at < v_now - interval '8 days';
  IF v_prev_at IS NULL THEN
    RETURN;
  END IF;
  tuples_read := CASE WHEN v_total >= v_prev_total THEN v_total - v_prev_total ELSE v_total END;
  window_minutes := greatest(1, ceil(extract(epoch FROM v_now - v_prev_at) / 60))::integer;
  SELECT CASE WHEN count(*) >= 24 THEN round(percentile_cont(0.5) WITHIN GROUP (ORDER BY x.rate))::bigint END
    INTO baseline_per_hour
    FROM (SELECT (r.tuples_total - r.prev_total) / (extract(epoch FROM r.sampled_at - r.prev_at) / 3600) AS rate
            FROM (SELECT s.sampled_at, s.tuples_total,
                         lag(s.sampled_at) OVER (ORDER BY s.sampled_at) AS prev_at,
                         lag(s.tuples_total) OVER (ORDER BY s.sampled_at) AS prev_total
                    FROM app.read_volume_samples s
                   WHERE s.sampled_at <= v_prev_at AND s.sampled_at >= v_prev_at - interval '7 days') r
           WHERE r.prev_at IS NOT NULL AND r.tuples_total >= r.prev_total
             AND r.sampled_at - r.prev_at >= interval '30 minutes') x;
  SELECT coalesce(max(x.n), 0)::integer INTO operator_actions_max
    FROM (SELECT count(*) AS n FROM public.audit_logs a
           WHERE a.operator_role IS NOT NULL AND a.created_at >= v_prev_at
           GROUP BY a.operator_role) x;
  RETURN NEXT;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.security_volume_sample() FROM PUBLIC, app_user, app_operator;
GRANT EXECUTE ON FUNCTION app.security_volume_sample() TO app_worker;

-- ---------- 7b-R3 ----------
-- Igual à da 7b, mais o AuditLog `privacy_request_lookup` nos dois caminhos que não abrem pedido: e-mail sem
-- conta (sem pessoa nem recurso) e pedido do mesmo tipo já aberto (pessoa e pedido). Só o papel de quem consultou;
-- nunca o e-mail. Entra na contagem por operador do alerta de volume.
-- Revisão da 7c (M2): o AuditLog some se quem chama desfaz a transação (ROLLBACK, erro provocado depois). Por isso a
-- consulta também vai ao log do servidor do banco por `RAISE LOG`, que não é desfeito: só a ação e o papel, nunca o
-- e-mail nem a pessoa (o canal externo desse log fica no CHECKLIST_GO_LIVE).
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
    RAISE LOG 'privacy_request_lookup operator_role=%', v_operator;
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
    RAISE LOG 'privacy_request_lookup operator_role=%', v_operator;
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
