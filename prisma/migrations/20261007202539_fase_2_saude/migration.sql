-- CreateEnum
CREATE TYPE "data_mode" AS ENUM ('demo', 'own');

-- CreateEnum
CREATE TYPE "mood_emotion" AS ENUM ('calm', 'joy', 'gratitude', 'motivation', 'focus', 'tiredness', 'worry', 'irritation', 'sadness', 'boredom');

-- CreateEnum
CREATE TYPE "habit_frequency" AS ENUM ('daily', 'weekdays', 'times_per_week');

-- CreateEnum
CREATE TYPE "journal_tag" AS ENUM ('work', 'study', 'family', 'friends', 'rest', 'movement', 'leisure', 'nature', 'routine', 'other');

-- AlterTable
ALTER TABLE "privacy_requests" ADD COLUMN     "period_end" DATE,
ADD COLUMN     "period_start" DATE,
ADD COLUMN     "score_version" SMALLINT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "data_mode" "data_mode",
ADD COLUMN     "streaks_enabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "sleep_entries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "bed_at" TIMESTAMPTZ(3) NOT NULL,
    "wake_at" TIMESTAMPTZ(3) NOT NULL,
    "quality" SMALLINT,
    "awakenings" SMALLINT,
    "note_enc" BYTEA,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sleep_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mood_entries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "logged_at" TIMESTAMPTZ(3) NOT NULL,
    "mood" SMALLINT NOT NULL,
    "energy" SMALLINT NOT NULL,
    "stress" SMALLINT NOT NULL,
    "emotions" "mood_emotion"[],
    "note_enc" BYTEA,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "mood_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "habits" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name_enc" BYTEA NOT NULL,
    "frequency" "habit_frequency" NOT NULL,
    "weekdays" SMALLINT[],
    "times_per_week" SMALLINT,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "habits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "habit_checks" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "habit_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "habit_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "entry_date" DATE NOT NULL,
    "content_enc" BYTEA NOT NULL,
    "mood" SMALLINT,
    "tags" "journal_tag"[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "body_measurements" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "measured_at" TIMESTAMPTZ(3) NOT NULL,
    "weight_kg" DOUBLE PRECISION,
    "height_cm" DOUBLE PRECISION,
    "waist_cm" DOUBLE PRECISION,
    "hip_cm" DOUBLE PRECISION,
    "arm_cm" DOUBLE PRECISION,
    "thigh_cm" DOUBLE PRECISION,
    "chest_cm" DOUBLE PRECISION,
    "body_fat_pct" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "body_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sleep_entries_user_id_wake_at_idx" ON "sleep_entries"("user_id", "wake_at");

-- CreateIndex
CREATE INDEX "mood_entries_user_id_logged_at_idx" ON "mood_entries"("user_id", "logged_at");

-- CreateIndex
CREATE INDEX "habits_user_id_idx" ON "habits"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "habits_id_user_id_key" ON "habits"("id", "user_id");

-- CreateIndex
CREATE INDEX "habit_checks_user_id_day_idx" ON "habit_checks"("user_id", "day");

-- CreateIndex
CREATE UNIQUE INDEX "habit_checks_habit_id_day_key" ON "habit_checks"("habit_id", "day");

-- CreateIndex
CREATE INDEX "journal_entries_user_id_entry_date_idx" ON "journal_entries"("user_id", "entry_date");

-- CreateIndex
CREATE INDEX "body_measurements_user_id_measured_at_idx" ON "body_measurements"("user_id", "measured_at");

-- AddForeignKey
ALTER TABLE "sleep_entries" ADD CONSTRAINT "sleep_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mood_entries" ADD CONSTRAINT "mood_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habits" ADD CONSTRAINT "habits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habit_checks" ADD CONSTRAINT "habit_checks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "habit_checks" ADD CONSTRAINT "habit_checks_habit_id_user_id_fkey" FOREIGN KEY ("habit_id", "user_id") REFERENCES "habits"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "body_measurements" ADD CONSTRAINT "body_measurements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =====================================================================================================
-- Escrito à mão (ADR-0021; LEG-S03, LEG-C04, LEG-S02, LEG-D04, LEG-D08, PR1b-N1, PR1b-B9).
--
-- TABELAS DE SAÚDE: SELECT/INSERT/UPDATE exigem dono E consentimento `health_data` ativo, no mesmo modelo
-- de tests/db/consent-helpers.ts (ADR-0019). DELETE só por dono: a eliminação agendada roda depois da
-- revogação. ATENÇÃO: no Postgres, um DELETE cujo WHERE/RETURNING lê colunas também aplica a política de
-- SELECT; por isso os eliminadores usam `DELETE FROM tabela` SEM WHERE (a política de DELETE já restringe
-- ao dono). Teste: tests/db/health-coverage.test.ts (toda tabela com user_id fora da lista de não-saúde
-- precisa deste modelo e precisa ser zerada pelo eliminador).
-- =====================================================================================================

-- ---------- users: colunas novas que o runtime pode alterar (ADR-0017) ----------
GRANT UPDATE (data_mode, streaks_enabled) ON public.users TO app_user;

-- ---------- Faixas e coerência (além do Zod) ----------
ALTER TABLE public.sleep_entries
  ADD CONSTRAINT sleep_entries_window CHECK (wake_at > bed_at AND wake_at - bed_at <= interval '24 hours'),
  ADD CONSTRAINT sleep_entries_quality CHECK (quality IS NULL OR quality BETWEEN 1 AND 5),
  ADD CONSTRAINT sleep_entries_awakenings CHECK (awakenings IS NULL OR awakenings BETWEEN 0 AND 50);

ALTER TABLE public.mood_entries
  ADD CONSTRAINT mood_entries_scales CHECK (mood BETWEEN 1 AND 5 AND energy BETWEEN 1 AND 5 AND stress BETWEEN 1 AND 5),
  ADD CONSTRAINT mood_entries_emotions CHECK (emotions IS NOT NULL AND cardinality(emotions) <= 10);

ALTER TABLE public.habits
  ADD CONSTRAINT habits_weekdays CHECK (weekdays IS NOT NULL AND weekdays <@ ARRAY[0,1,2,3,4,5,6]::smallint[]),
  ADD CONSTRAINT habits_frequency CHECK (
    (frequency = 'daily' AND cardinality(weekdays) = 0 AND times_per_week IS NULL) OR
    (frequency = 'weekdays' AND cardinality(weekdays) BETWEEN 1 AND 7 AND times_per_week IS NULL) OR
    (frequency = 'times_per_week' AND cardinality(weekdays) = 0 AND times_per_week BETWEEN 1 AND 7));

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_mood CHECK (mood IS NULL OR mood BETWEEN 1 AND 5),
  ADD CONSTRAINT journal_entries_tags CHECK (tags IS NOT NULL AND cardinality(tags) <= 10);

ALTER TABLE public.body_measurements
  ADD CONSTRAINT body_measurements_any CHECK (num_nonnulls(weight_kg, height_cm, waist_cm, hip_cm, arm_cm, thigh_cm, chest_cm, body_fat_pct) > 0),
  ADD CONSTRAINT body_measurements_weight CHECK (weight_kg IS NULL OR weight_kg BETWEEN 20 AND 400),
  ADD CONSTRAINT body_measurements_height CHECK (height_cm IS NULL OR height_cm BETWEEN 50 AND 260),
  ADD CONSTRAINT body_measurements_girths CHECK (
    (waist_cm IS NULL OR waist_cm BETWEEN 10 AND 300) AND (hip_cm IS NULL OR hip_cm BETWEEN 10 AND 300) AND
    (arm_cm IS NULL OR arm_cm BETWEEN 10 AND 300) AND (thigh_cm IS NULL OR thigh_cm BETWEEN 10 AND 300) AND
    (chest_cm IS NULL OR chest_cm BETWEEN 10 AND 300)),
  ADD CONSTRAINT body_measurements_fat CHECK (body_fat_pct IS NULL OR body_fat_pct BETWEEN 1 AND 80);

ALTER TABLE public.privacy_requests
  ADD CONSTRAINT privacy_requests_review_scope CHECK (
    kind = 'automated_review' OR (score_version IS NULL AND period_start IS NULL AND period_end IS NULL)),
  ADD CONSTRAINT privacy_requests_review_period CHECK (period_end IS NULL OR period_start <= period_end);

-- ---------- RLS: dono + consentimento de saúde ----------
ALTER TABLE public.sleep_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mood_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.body_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY sleep_entries_select ON public.sleep_entries FOR SELECT
  USING (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY sleep_entries_insert ON public.sleep_entries FOR INSERT
  WITH CHECK (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY sleep_entries_update ON public.sleep_entries FOR UPDATE
  USING (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')))
  WITH CHECK (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY sleep_entries_delete ON public.sleep_entries FOR DELETE
  USING (user_id = (SELECT app.current_user_id()));

CREATE POLICY mood_entries_select ON public.mood_entries FOR SELECT
  USING (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY mood_entries_insert ON public.mood_entries FOR INSERT
  WITH CHECK (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY mood_entries_update ON public.mood_entries FOR UPDATE
  USING (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')))
  WITH CHECK (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY mood_entries_delete ON public.mood_entries FOR DELETE
  USING (user_id = (SELECT app.current_user_id()));

CREATE POLICY habits_select ON public.habits FOR SELECT
  USING (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY habits_insert ON public.habits FOR INSERT
  WITH CHECK (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY habits_update ON public.habits FOR UPDATE
  USING (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')))
  WITH CHECK (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY habits_delete ON public.habits FOR DELETE
  USING (user_id = (SELECT app.current_user_id()));

-- habit_checks: a FK composta (habit_id, user_id) garante que o hábito é do mesmo dono.
CREATE POLICY habit_checks_select ON public.habit_checks FOR SELECT
  USING (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY habit_checks_insert ON public.habit_checks FOR INSERT
  WITH CHECK (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY habit_checks_update ON public.habit_checks FOR UPDATE
  USING (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')))
  WITH CHECK (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY habit_checks_delete ON public.habit_checks FOR DELETE
  USING (user_id = (SELECT app.current_user_id()));

CREATE POLICY journal_entries_select ON public.journal_entries FOR SELECT
  USING (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY journal_entries_insert ON public.journal_entries FOR INSERT
  WITH CHECK (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY journal_entries_update ON public.journal_entries FOR UPDATE
  USING (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')))
  WITH CHECK (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY journal_entries_delete ON public.journal_entries FOR DELETE
  USING (user_id = (SELECT app.current_user_id()));

CREATE POLICY body_measurements_select ON public.body_measurements FOR SELECT
  USING (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY body_measurements_insert ON public.body_measurements FOR INSERT
  WITH CHECK (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY body_measurements_update ON public.body_measurements FOR UPDATE
  USING (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')))
  WITH CHECK (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY body_measurements_delete ON public.body_measurements FOR DELETE
  USING (user_id = (SELECT app.current_user_id()));

-- Sem TRUNCATE para o runtime (TRUNCATE ignora RLS).
REVOKE TRUNCATE ON public.sleep_entries, public.mood_entries, public.habits, public.habit_checks,
  public.journal_entries, public.body_measurements FROM app_user;

-- ---------- Pedido de revisão do Índice de Bem-Estar (LEG-D08, LEG-D07) ----------
-- O runtime não insere em privacy_requests (prova). Esta função abre um pedido `automated_review` da
-- própria pessoa, com a versão do Índice e o período (nunca valores). Idempotente: com um pedido aberto,
-- devolve o existente (sem duplicata nem spam). Prazo: 15 dias (art. 19, II).
CREATE FUNCTION app.privacy_request_score_review(p_score_version smallint, p_period_start date,
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
