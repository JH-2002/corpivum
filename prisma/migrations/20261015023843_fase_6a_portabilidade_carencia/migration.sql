-- AlterEnum
ALTER TYPE "audit_action" ADD VALUE 'data_export_health_read';

-- =================================================================================================
-- OI-32, opção (b) (decisão do produto, 2026-10-15; LEGAL-REVIEW): quem revogou o consentimento de saúde pode
-- exportar TUDO o que ainda guardamos até a eliminação. Base: atendimento ao direito do titular (art. 18), não o
-- consentimento. A exportação completa é o ÚNICO uso nesse período: as tabelas de saúde (telas, gráficos,
-- resumos, twin) continuam com as mesmas políticas, que exigem consentimento ativo. Escrito à mão.
-- =================================================================================================

-- Carência: eliminação agendada e ainda não vencida, sem consentimento ativo (a pessoa revogou).
CREATE FUNCTION app.health_grace_active() RETURNS boolean
  LANGUAGE sql STABLE
  SET search_path = pg_catalog, pg_temp
AS $$
  SELECT EXISTS (
           SELECT 1 FROM public.users u
            WHERE u.id = app.current_user_id() AND u.health_data_purge_at > now())
     AND NOT app.has_active_consent('health_data');
$$;

REVOKE EXECUTE ON FUNCTION app.health_grace_active() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.health_grace_active() TO app_user;

-- Pedidos de exportação: na carência, o dono vê e conduz só pedidos de EXPORTAÇÃO COMPLETA (relatório exige
-- consentimento). Só esta tabela de metadados muda; nenhuma política das tabelas de saúde é tocada.
DROP POLICY data_export_jobs_select ON public.data_export_jobs;
DROP POLICY data_export_jobs_insert ON public.data_export_jobs;
DROP POLICY data_export_jobs_update ON public.data_export_jobs;

CREATE POLICY data_export_jobs_select ON public.data_export_jobs FOR SELECT
  USING (user_id = (SELECT app.current_user_id()) AND
         ((SELECT app.has_active_consent('health_data')) OR
          (kind = 'full_export' AND (SELECT app.health_grace_active()))));
CREATE POLICY data_export_jobs_insert ON public.data_export_jobs FOR INSERT
  WITH CHECK (user_id = (SELECT app.current_user_id()) AND
              ((SELECT app.has_active_consent('health_data')) OR
               (kind = 'full_export' AND (SELECT app.health_grace_active()))));
CREATE POLICY data_export_jobs_update ON public.data_export_jobs FOR UPDATE
  USING (user_id = (SELECT app.current_user_id()) AND
         ((SELECT app.has_active_consent('health_data')) OR
          (kind = 'full_export' AND (SELECT app.health_grace_active()))))
  WITH CHECK (user_id = (SELECT app.current_user_id()) AND
              ((SELECT app.has_active_consent('health_data')) OR
               (kind = 'full_export' AND (SELECT app.health_grace_active()))));

-- Leitura dos dados de saúde SÓ para o job de exportação completa: exige um pedido da própria pessoa em geração
-- (`processing`), com consentimento ativo ou na carência. Devolve só as linhas da pessoa, na ordem das telas, e
-- grava o AuditLog (sem conteúdo). Os textos continuam cifrados (envelope): a aplicação decifra.
CREATE FUNCTION app.export_job_health_data(p_job_id uuid) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_user uuid := app.current_user_id();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'export requires user context' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
       SELECT 1 FROM public.data_export_jobs j
        WHERE j.id = p_job_id AND j.user_id = v_user AND j.kind = 'full_export'
          AND j.status = 'processing' AND j.file_deleted_at IS NULL) THEN
    RAISE EXCEPTION 'export job not in progress' USING ERRCODE = '42501';
  END IF;
  IF NOT (app.has_active_consent('health_data') OR app.health_grace_active()) THEN
    RAISE EXCEPTION 'no consent nor pending elimination' USING ERRCODE = '42501';
  END IF;

  PERFORM app.audit_append('data_export_health_read', 'data_export', p_job_id, true);

  RETURN jsonb_build_object(
    'sleep', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.wake_at), '[]'::jsonb)
                FROM public.sleep_entries t WHERE t.user_id = v_user),
    'habits', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at), '[]'::jsonb)
                 FROM public.habits t WHERE t.user_id = v_user),
    'habit_checks', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.day, t.created_at), '[]'::jsonb)
                       FROM public.habit_checks t WHERE t.user_id = v_user),
    'body', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.measured_at), '[]'::jsonb)
               FROM public.body_measurements t WHERE t.user_id = v_user),
    'meals', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.eaten_at), '[]'::jsonb)
                FROM public.meal_entries t WHERE t.user_id = v_user),
    'water', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.day, t.created_at), '[]'::jsonb)
                FROM public.water_entries t WHERE t.user_id = v_user),
    'activities', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.started_at), '[]'::jsonb)
                     FROM public.activity_entries t WHERE t.user_id = v_user),
    'strength_sets', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.set_index), '[]'::jsonb)
                        FROM public.strength_sets t WHERE t.user_id = v_user),
    'goals', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at), '[]'::jsonb)
                FROM public.goals t WHERE t.user_id = v_user),
    'reminders', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.time_min, t.created_at), '[]'::jsonb)
                    FROM public.reminders t WHERE t.user_id = v_user)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION app.export_job_health_data(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.export_job_health_data(uuid) TO app_user;

-- ---------- Revisão de privacidade do OI-32 (ADR-0033) ----------
-- B3: leitura única. A função grava `health_read_at` e recusa uma segunda leitura do mesmo pedido.
ALTER TABLE public.data_export_jobs ADD COLUMN health_read_at timestamptz(3);

-- B1: o estado do pedido (a "chave" da função) só anda para a frente, conferido no banco:
-- nasce `queued` sem prazo, arquivo nem leitura; nunca volta para `queued`/`processing`/`ready` de outro estado.
CREATE OR REPLACE FUNCTION app.data_export_jobs_guard() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'queued' OR NEW.expires_at IS NOT NULL OR NEW.size_bytes IS NOT NULL
       OR NEW.file_deleted_at IS NOT NULL OR NEW.health_read_at IS NOT NULL THEN
      RAISE EXCEPTION 'export job must start queued' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.expires_at IS NOT NULL AND NEW.expires_at > now() + interval '24 hours 1 second' THEN
    RAISE EXCEPTION 'export link longer than 24 hours' USING ERRCODE = '23514';
  END IF;
  IF OLD.expires_at IS NOT NULL AND (NEW.expires_at IS NULL OR NEW.expires_at > OLD.expires_at) THEN
    RAISE EXCEPTION 'export link cannot be extended' USING ERRCODE = '23514';
  END IF;
  IF OLD.file_deleted_at IS NOT NULL AND
     (NEW.file_deleted_at IS DISTINCT FROM OLD.file_deleted_at OR NEW.status <> 'expired') THEN
    RAISE EXCEPTION 'export file already deleted' USING ERRCODE = '23514';
  END IF;
  IF OLD.health_read_at IS NOT NULL AND NEW.health_read_at IS DISTINCT FROM OLD.health_read_at THEN
    RAISE EXCEPTION 'export health read is final' USING ERRCODE = '23514';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'queued' AND NEW.status IN ('processing', 'expired')) OR
       (OLD.status = 'processing' AND NEW.status IN ('ready', 'failed', 'expired')) OR
       (OLD.status IN ('ready', 'failed') AND NEW.status = 'expired')) THEN
    RAISE EXCEPTION 'invalid export status transition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- B2 + B3: colunas em lista fechada (só o que a exportação usa) e leitura única por pedido.
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

  PERFORM app.audit_append('data_export_health_read', 'data_export', p_job_id, true);

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
