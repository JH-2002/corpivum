-- =====================================================================================================
-- Escrito à mão (ADR-0036 D5, ADR-0037; LEG-S03, LEG-S04, LEG-S06, LEG-D04). Endurecimento de papéis da 7b.
-- Mesmas regras da ADR-0015: SECURITY DEFINER com search_path fixo, objetos qualificados, sem SQL dinâmico,
-- retorno mínimo.
--   D5 / PR1b-B3 / PR1b-M1 residual / P7-N6: varreduras, expurgos, fila e purga de conta só no `app_worker`.
--   P7-B1: o runtime não grava mais `users.deleted_at`; a purga exige pedido de exclusão em andamento.
--   P7-N2: a purga apaga também os jobs da pessoa.
--   PR1a-R2-B5: UPDATE em `sessions` só nas colunas que o runtime altera.
--   PR1a-R2-B7: o expurgo dos limites tem folga de 5 minutos (relógio da aplicação × do banco).
--   PR1a-R3-B7: segredo TOTP pendente sai 1 hora depois do início (vale 15 minutos).
--   PR1b-B2: ação "do sistema" (sem ator) só por função própria, com lista fechada de ações.
--   PR1b-B8: a fila só apaga o job que ela reservou; varreduras pulam contas com job falho.
-- =====================================================================================================

-- O papel dos jobs é criado fora das migrações (o app_migrator não cria papéis):
-- docker/postgres/init/04-worker-role.sh (dev/CI) e o runbook de provisionamento (produção).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'app_worker') THEN
    RAISE EXCEPTION 'papel app_worker ausente: rode pnpm db:worker:init (docs/runbooks/LOCAL_DEV.md)';
  END IF;
  IF NOT pg_catalog.pg_has_role('app_worker', 'app_user', 'USAGE') THEN
    RAISE EXCEPTION 'app_worker precisa herdar app_user: rode pnpm db:worker:init';
  END IF;
END;
$$;

GRANT USAGE ON SCHEMA app TO app_worker;

-- ---------- P7-B1: deleted_at só pelas funções de exclusão ----------
REVOKE UPDATE (deleted_at) ON public.users FROM app_user;

-- ---------- PR1a-R2-B5: sessões ----------
REVOKE UPDATE ON public.sessions FROM app_user;
GRANT UPDATE (last_seen_at, idle_expires_at, revoked_at, mfa_attempts, updated_at)
  ON public.sessions TO app_user;

-- ---------- PR1b-B2: AuditLog "do sistema" ----------
-- `audit_append` deixa de aceitar `p_system`: o ator é sempre a pessoa do contexto. Ações feitas por job ou
-- avisos automáticos usam `audit_append_system`, que só aceita a lista abaixo.
DROP FUNCTION app.audit_append(public.audit_action, public.audit_resource_type, uuid, boolean);

CREATE FUNCTION app.audit_append(p_action public.audit_action, p_resource_type public.audit_resource_type,
                                 p_resource_id uuid)
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
  VALUES (gen_random_uuid(), v_user, v_user, p_action, p_resource_type, p_resource_id, now(), now());
END;
$$;

CREATE FUNCTION app.audit_append_system(p_action public.audit_action,
                                        p_resource_type public.audit_resource_type, p_resource_id uuid)
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
  IF p_action::text NOT IN ('health_data_eliminated', 'account_deletion_notice_sent',
                            'data_export_health_read') THEN
    RAISE EXCEPTION 'not a system action' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.audit_logs (id, actor_user_id, subject_user_id, action, resource_type, resource_id,
                                 created_at, updated_at)
  VALUES (gen_random_uuid(), NULL, v_user, p_action, p_resource_type, p_resource_id, now(), now());
END;
$$;

-- A leitura dos dados de saúde pela exportação (job) passa a usar a função do sistema. Corpo igual ao da
-- migração `fase_6a_portabilidade_carencia`, só com a troca da chamada.
CREATE OR REPLACE FUNCTION app.export_job_health_data(p_job_id uuid) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_user uuid := app.current_user_id();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'export requires user context' USING ERRCODE = '42501';
  END IF;
  UPDATE public.data_export_jobs j SET health_read_at = now(), updated_at = now()
   WHERE j.id = p_job_id AND j.user_id = v_user AND j.kind = 'full_export'
     AND j.status = 'processing' AND j.file_deleted_at IS NULL AND j.health_read_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'export job not in progress' USING ERRCODE = '42501';
  END IF;
  IF NOT (app.has_active_consent('health_data') OR app.health_grace_active()) THEN
    RAISE EXCEPTION 'no consent nor pending elimination' USING ERRCODE = '42501';
  END IF;

  PERFORM app.audit_append_system('data_export_health_read', 'data_export', p_job_id);

  RETURN jsonb_build_object(
    'sleep', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                'id', t.id, 'bed_at', t.bed_at, 'wake_at', t.wake_at, 'quality', t.quality,
                'awakenings', t.awakenings, 'note_enc', t.note_enc) ORDER BY t.wake_at), '[]'::jsonb)
                FROM public.sleep_entries t WHERE t.user_id = v_user),
    'habits', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'id', t.id, 'name_enc', t.name_enc, 'frequency', t.frequency, 'weekdays', t.weekdays,
                 'times_per_week', t.times_per_week, 'archived_at', t.archived_at,
                 'created_at', t.created_at) ORDER BY t.created_at), '[]'::jsonb)
                 FROM public.habits t WHERE t.user_id = v_user),
    'habit_checks', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                       'habit_id', t.habit_id, 'day', t.day) ORDER BY t.day, t.created_at), '[]'::jsonb)
                       FROM public.habit_checks t WHERE t.user_id = v_user),
    'body', (SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', t.id, 'measured_at', t.measured_at, 'weight_kg', t.weight_kg,
               'height_cm', t.height_cm, 'waist_cm', t.waist_cm, 'hip_cm', t.hip_cm, 'arm_cm', t.arm_cm,
               'thigh_cm', t.thigh_cm, 'chest_cm', t.chest_cm, 'body_fat_pct', t.body_fat_pct)
               ORDER BY t.measured_at), '[]'::jsonb)
               FROM public.body_measurements t WHERE t.user_id = v_user),
    'meals', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                'id', t.id, 'eaten_at', t.eaten_at, 'category', t.category,
                'description_enc', t.description_enc, 'hunger', t.hunger, 'fullness', t.fullness,
                'satisfaction', t.satisfaction, 'kcal_estimate', t.kcal_estimate, 'note_enc', t.note_enc)
                ORDER BY t.eaten_at), '[]'::jsonb)
                FROM public.meal_entries t WHERE t.user_id = v_user),
    'water', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                'id', t.id, 'day', t.day, 'ml', t.ml) ORDER BY t.day, t.created_at), '[]'::jsonb)
                FROM public.water_entries t WHERE t.user_id = v_user),
    'activities', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'id', t.id, 'started_at', t.started_at, 'type', t.type, 'duration_min', t.duration_min,
                     'intensity', t.intensity, 'distance_km', t.distance_km, 'note_enc', t.note_enc)
                     ORDER BY t.started_at), '[]'::jsonb)
                     FROM public.activity_entries t WHERE t.user_id = v_user),
    'strength_sets', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                        'activity_id', t.activity_id, 'exercise_name_enc', t.exercise_name_enc,
                        'set_index', t.set_index, 'reps', t.reps, 'load_kg', t.load_kg)
                        ORDER BY t.set_index), '[]'::jsonb)
                        FROM public.strength_sets t WHERE t.user_id = v_user),
    'goals', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                'id', t.id, 'domain', t.domain, 'metric', t.metric, 'target_value', t.target_value,
                'start_value', t.start_value, 'habit_id', t.habit_id, 'target_day', t.target_day,
                'status', t.status, 'created_at', t.created_at) ORDER BY t.created_at), '[]'::jsonb)
                FROM public.goals t WHERE t.user_id = v_user),
    'reminders', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                    'id', t.id, 'kind', t.kind, 'habit_id', t.habit_id, 'time_min', t.time_min,
                    'weekdays', t.weekdays, 'enabled', t.enabled) ORDER BY t.time_min, t.created_at),
                    '[]'::jsonb)
                    FROM public.reminders t WHERE t.user_id = v_user)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION
  app.audit_append(public.audit_action, public.audit_resource_type, uuid),
  app.audit_append_system(public.audit_action, public.audit_resource_type, uuid)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  app.audit_append(public.audit_action, public.audit_resource_type, uuid),
  app.audit_append_system(public.audit_action, public.audit_resource_type, uuid)
TO app_user;

-- ---------- Expurgo de autenticação (PR1a-R2-B7, PR1a-R3-B7) ----------
CREATE OR REPLACE FUNCTION app.auth_purge_expired()
  RETURNS TABLE (sessions integer, tokens integer, buckets integer, unverified_users integer,
                 pending_totp integer)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_sessions integer;
  v_tokens integer;
  v_buckets integer;
  v_users integer;
  v_totp integer;
BEGIN
  DELETE FROM public.users u
   WHERE u.email_verified_at IS NULL AND u.created_at < now() - interval '7 days';
  GET DIAGNOSTICS v_users = ROW_COUNT;

  -- O segredo pendente vale 15 minutos; sai 1 hora depois do início (antes: 1 dia).
  UPDATE public.users u
     SET totp_secret = NULL, totp_last_used_step = NULL, totp_setup_started_at = NULL,
         updated_at = now()
   WHERE u.mfa_enabled_at IS NULL AND u.totp_secret IS NOT NULL
     AND coalesce(u.totp_setup_started_at, u.updated_at) < now() - interval '1 hour';
  GET DIAGNOSTICS v_totp = ROW_COUNT;

  DELETE FROM public.sessions s
   WHERE coalesce(s.revoked_at, least(s.expires_at, s.idle_expires_at)) < now() - interval '1 day';
  GET DIAGNOSTICS v_sessions = ROW_COUNT;

  DELETE FROM public.auth_tokens t
   WHERE coalesce(t.used_at, t.expires_at) < now() - interval '1 day';
  GET DIAGNOSTICS v_tokens = ROW_COUNT;

  -- A janela usa o relógio da aplicação (`p_now`): folga de 5 minutos para diferença de relógio.
  DELETE FROM public.rate_limit_buckets b WHERE b.expires_at <= now() - interval '5 minutes';
  GET DIAGNOSTICS v_buckets = ROW_COUNT;

  RETURN QUERY SELECT v_sessions, v_tokens, v_buckets, v_users, v_totp;
END;
$$;

-- ---------- PR1b-B8: fila ----------
-- (b) O ramo de chave repetida só apaga o job reservado por este worker.
CREATE OR REPLACE FUNCTION app.jobs_fail(p_id uuid, p_worker text, p_error_code text, p_retry_seconds integer)
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
    -- Já existe outro job na fila com a mesma chave: este sai, se ainda for deste worker.
    DELETE FROM public.job_queue j WHERE j.id = p_id AND j.status = 'running' AND j.locked_by = p_worker;
  END;
  RETURN FOUND;
END;
$$;

-- (c) As varreduras pulam contas cujo job do mesmo tipo falhou (ficam para o atendimento e voltam quando a
-- falha sai da fila, em 30 dias): as primeiras da lista não bloqueiam as outras para sempre.
CREATE OR REPLACE FUNCTION app.privacy_due_health_eliminations(p_limit integer)
  RETURNS TABLE (user_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
  SELECT u.id FROM public.users u
   WHERE u.health_data_purge_at <= now() AND u.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.job_queue q
                      WHERE q.status = 'failed' AND q.name = 'privacy.health_data_eliminate'
                        AND q.payload ->> 'userId' = u.id::text)
   ORDER BY u.health_data_purge_at
   LIMIT least(greatest(p_limit, 1), 1000);
$$;

CREATE OR REPLACE FUNCTION app.account_purge_due(p_limit integer)
  RETURNS TABLE (user_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
  SELECT u.id FROM public.users u
   WHERE u.deleted_at IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.job_queue q
                      WHERE q.status = 'failed' AND q.name = 'privacy.account_purge'
                        AND q.payload ->> 'userId' = u.id::text)
   ORDER BY u.deleted_at
   LIMIT least(greatest(p_limit, 1), 1000);
$$;

-- ---------- P7-B1 + P7-N2: purga ----------
-- Só conta excluída E com pedido `deletion` (ou `minor_closure`, ADR-0037) em andamento: as duas marcas só
-- nascem juntas nas funções de exclusão (com prova de reautenticação ou pelo atendimento auditado). Apaga
-- também os jobs da pessoa (payload com o id), que sobreviveriam até rodar.
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
  IF NOT EXISTS (SELECT 1 FROM public.privacy_requests r
                  WHERE r.user_id = v_user AND r.kind::text IN ('deletion', 'minor_closure')
                    AND r.status = 'in_progress') THEN
    RAISE EXCEPTION 'account purge requires a deletion request' USING ERRCODE = '42501';
  END IF;
  -- Só o pedido de exclusão (ou de encerramento) foi atendido; os demais perdem o objeto e saem recusados.
  FOR v_id IN
    UPDATE public.privacy_requests r
       SET status = CASE WHEN r.kind::text IN ('deletion', 'minor_closure')
                         THEN 'completed'::public.privacy_request_status
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
  DELETE FROM public.job_queue q
   WHERE q.payload ->> 'userId' = v_user::text AND q.status <> 'running';
  DELETE FROM public.users u WHERE u.id = v_user;
  RETURN true;
END;
$$;

-- ---------- D5: varreduras, retenção, fila e purga só no app_worker ----------
REVOKE EXECUTE ON FUNCTION
  app.auth_purge_expired(),
  app.privacy_purge_access_logs(integer),
  app.privacy_purge_proofs(integer),
  app.privacy_purge_reauth_proofs(),
  app.privacy_due_health_eliminations(integer),
  app.privacy_request_deadlines(),
  app.account_purge(),
  app.account_purge_due(integer),
  app.exports_cleanup_due(integer),
  app.exports_purge_rows(),
  app.jobs_claim(text, text[], integer, integer),
  app.jobs_complete(uuid, text),
  app.jobs_fail(uuid, text, text, integer)
FROM PUBLIC, app_user;
GRANT EXECUTE ON FUNCTION
  app.auth_purge_expired(),
  app.privacy_purge_access_logs(integer),
  app.privacy_purge_proofs(integer),
  app.privacy_purge_reauth_proofs(),
  app.privacy_due_health_eliminations(integer),
  app.privacy_request_deadlines(),
  app.account_purge(),
  app.account_purge_due(integer),
  app.exports_cleanup_due(integer),
  app.exports_purge_rows(),
  app.jobs_claim(text, text[], integer, integer),
  app.jobs_complete(uuid, text),
  app.jobs_fail(uuid, text, text, integer)
TO app_worker;
