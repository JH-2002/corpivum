-- CreateEnum
CREATE TYPE "meal_category" AS ENUM ('breakfast', 'lunch', 'dinner', 'snack', 'other');

-- CreateEnum
CREATE TYPE "activity_type" AS ENUM ('walking', 'running', 'cycling', 'swimming', 'strength', 'stretching', 'dance', 'sport', 'other');

-- CreateEnum
CREATE TYPE "goal_domain" AS ENUM ('sleep', 'activity', 'habits', 'weight', 'logging', 'nutrition');

-- CreateEnum
CREATE TYPE "goal_metric" AS ENUM ('sleep_avg_minutes', 'activity_minutes_week', 'activity_sessions_week', 'habit_completion_pct', 'weight_kg', 'logging_days_week', 'kcal_reference_day');

-- CreateEnum
CREATE TYPE "goal_status" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "reminder_kind" AS ENUM ('habit', 'daily_log');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "calorie_estimate_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "quiet_end_min" SMALLINT,
ADD COLUMN     "quiet_start_min" SMALLINT,
ADD COLUMN     "remind_daily_log" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "remind_habits" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "meal_entries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "eaten_at" TIMESTAMPTZ(3) NOT NULL,
    "category" "meal_category" NOT NULL,
    "description_enc" BYTEA,
    "hunger" SMALLINT,
    "fullness" SMALLINT,
    "satisfaction" SMALLINT,
    "kcal_estimate" SMALLINT,
    "note_enc" BYTEA,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "meal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "water_entries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "ml" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "water_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_entries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "type" "activity_type" NOT NULL,
    "duration_min" SMALLINT NOT NULL,
    "intensity" SMALLINT,
    "distance_km" DOUBLE PRECISION,
    "note_enc" BYTEA,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "activity_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strength_sets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "activity_id" UUID NOT NULL,
    "exercise_name_enc" BYTEA NOT NULL,
    "set_index" SMALLINT NOT NULL,
    "reps" SMALLINT NOT NULL,
    "load_kg" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "strength_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goals" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "domain" "goal_domain" NOT NULL,
    "metric" "goal_metric" NOT NULL,
    "target_value" DOUBLE PRECISION NOT NULL,
    "start_value" DOUBLE PRECISION,
    "habit_id" UUID,
    "habit_user_id" UUID,
    "target_day" DATE,
    "status" "goal_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "reminder_kind" NOT NULL,
    "habit_id" UUID,
    "habit_user_id" UUID,
    "time_min" SMALLINT NOT NULL,
    "weekdays" SMALLINT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_sent_day" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meal_entries_user_id_eaten_at_idx" ON "meal_entries"("user_id", "eaten_at");

-- CreateIndex
CREATE INDEX "water_entries_user_id_day_idx" ON "water_entries"("user_id", "day");

-- CreateIndex
CREATE INDEX "activity_entries_user_id_started_at_idx" ON "activity_entries"("user_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "activity_entries_id_user_id_key" ON "activity_entries"("id", "user_id");

-- CreateIndex
CREATE INDEX "strength_sets_user_id_idx" ON "strength_sets"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "strength_sets_activity_id_set_index_key" ON "strength_sets"("activity_id", "set_index");

-- CreateIndex
CREATE INDEX "goals_user_id_status_idx" ON "goals"("user_id", "status");

-- CreateIndex
CREATE INDEX "reminders_user_id_idx" ON "reminders"("user_id");

-- AddForeignKey
ALTER TABLE "meal_entries" ADD CONSTRAINT "meal_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "water_entries" ADD CONSTRAINT "water_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_entries" ADD CONSTRAINT "activity_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strength_sets" ADD CONSTRAINT "strength_sets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strength_sets" ADD CONSTRAINT "strength_sets_activity_id_user_id_fkey" FOREIGN KEY ("activity_id", "user_id") REFERENCES "activity_entries"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_habit_id_habit_user_id_fkey" FOREIGN KEY ("habit_id", "habit_user_id") REFERENCES "habits"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_habit_id_habit_user_id_fkey" FOREIGN KEY ("habit_id", "habit_user_id") REFERENCES "habits"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =================================================================================================
-- Fase 4 (ADR-0029): alimentação, atividade, metas e lembretes. Tudo abaixo é escrito à mão.
-- =================================================================================================

-- ---------- Preferências da pessoa (não são dado de saúde; concessão por coluna, ADR-0017) ----------
ALTER TABLE public.users
  ADD CONSTRAINT users_quiet_hours CHECK (
    (quiet_start_min IS NULL AND quiet_end_min IS NULL) OR
    (quiet_start_min BETWEEN 0 AND 1439 AND quiet_end_min BETWEEN 0 AND 1439 AND quiet_start_min <> quiet_end_min));

GRANT UPDATE (calorie_estimate_enabled, remind_habits, remind_daily_log, quiet_start_min, quiet_end_min)
  ON public.users TO app_user;

-- ---------- Faixas e coerência (além do Zod) ----------
ALTER TABLE public.meal_entries
  ADD CONSTRAINT meal_entries_perceptions CHECK (
    (hunger IS NULL OR hunger BETWEEN 1 AND 5) AND (fullness IS NULL OR fullness BETWEEN 1 AND 5) AND
    (satisfaction IS NULL OR satisfaction BETWEEN 1 AND 5)),
  ADD CONSTRAINT meal_entries_kcal CHECK (kcal_estimate IS NULL OR kcal_estimate BETWEEN 1 AND 5000);

ALTER TABLE public.water_entries
  ADD CONSTRAINT water_entries_ml CHECK (ml BETWEEN 1 AND 5000);

ALTER TABLE public.activity_entries
  ADD CONSTRAINT activity_entries_duration CHECK (duration_min BETWEEN 1 AND 1440),
  ADD CONSTRAINT activity_entries_intensity CHECK (intensity IS NULL OR intensity BETWEEN 1 AND 10),
  ADD CONSTRAINT activity_entries_distance CHECK (distance_km IS NULL OR (distance_km > 0 AND distance_km <= 1000));

ALTER TABLE public.strength_sets
  ADD CONSTRAINT strength_sets_index CHECK (set_index BETWEEN 1 AND 50),
  ADD CONSTRAINT strength_sets_reps CHECK (reps BETWEEN 1 AND 1000),
  ADD CONSTRAINT strength_sets_load CHECK (load_kg IS NULL OR (load_kg >= 0 AND load_kg <= 1000));

-- Hábito referenciado: par completo, sempre da mesma pessoa (a FK composta confere o dono do hábito).
ALTER TABLE public.goals
  ADD CONSTRAINT goals_habit_owner CHECK (
    (habit_id IS NULL AND habit_user_id IS NULL) OR
    (habit_id IS NOT NULL AND habit_user_id IS NOT NULL AND habit_user_id = user_id)),
  ADD CONSTRAINT goals_target CHECK (target_value > 0 AND (start_value IS NULL OR start_value > 0)),
  ADD CONSTRAINT goals_metric_domain CHECK (
    (metric = 'sleep_avg_minutes' AND domain = 'sleep') OR
    (metric IN ('activity_minutes_week', 'activity_sessions_week') AND domain = 'activity') OR
    (metric = 'habit_completion_pct' AND domain = 'habits') OR
    (metric = 'weight_kg' AND domain = 'weight') OR
    (metric = 'logging_days_week' AND domain = 'logging') OR
    (metric = 'kcal_reference_day' AND domain = 'nutrition')),
  ADD CONSTRAINT goals_habit_metric CHECK ((metric = 'habit_completion_pct') = (habit_id IS NOT NULL)),
  -- Piso calórico no banco também (LEG-M07, GUARDRAIL_RULES.minDailyKcal; rascunho OI-23).
  ADD CONSTRAINT goals_kcal_floor CHECK (metric <> 'kcal_reference_day' OR target_value >= 1500),
  ADD CONSTRAINT goals_weight_start CHECK (metric <> 'weight_kg' OR start_value IS NOT NULL);

ALTER TABLE public.reminders
  ADD CONSTRAINT reminders_habit_owner CHECK (
    (habit_id IS NULL AND habit_user_id IS NULL) OR
    (habit_id IS NOT NULL AND habit_user_id IS NOT NULL AND habit_user_id = user_id)),
  ADD CONSTRAINT reminders_kind_habit CHECK ((kind = 'habit') = (habit_id IS NOT NULL)),
  ADD CONSTRAINT reminders_time CHECK (time_min BETWEEN 0 AND 1439),
  ADD CONSTRAINT reminders_weekdays CHECK (weekdays IS NOT NULL AND weekdays <@ ARRAY[0,1,2,3,4,5,6]::smallint[]);

-- ---------- RLS: dono + consentimento de saúde ----------
-- strength_sets: a FK composta (activity_id, user_id) garante que a atividade é do mesmo dono.
ALTER TABLE public.meal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.water_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strength_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY meal_entries_select ON public.meal_entries FOR SELECT
  USING (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY meal_entries_insert ON public.meal_entries FOR INSERT
  WITH CHECK (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY meal_entries_update ON public.meal_entries FOR UPDATE
  USING (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')))
  WITH CHECK (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY meal_entries_delete ON public.meal_entries FOR DELETE
  USING (user_id = (SELECT app.current_user_id()));

CREATE POLICY water_entries_select ON public.water_entries FOR SELECT
  USING (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY water_entries_insert ON public.water_entries FOR INSERT
  WITH CHECK (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY water_entries_update ON public.water_entries FOR UPDATE
  USING (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')))
  WITH CHECK (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY water_entries_delete ON public.water_entries FOR DELETE
  USING (user_id = (SELECT app.current_user_id()));

CREATE POLICY activity_entries_select ON public.activity_entries FOR SELECT
  USING (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY activity_entries_insert ON public.activity_entries FOR INSERT
  WITH CHECK (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY activity_entries_update ON public.activity_entries FOR UPDATE
  USING (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')))
  WITH CHECK (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY activity_entries_delete ON public.activity_entries FOR DELETE
  USING (user_id = (SELECT app.current_user_id()));

CREATE POLICY strength_sets_select ON public.strength_sets FOR SELECT
  USING (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY strength_sets_insert ON public.strength_sets FOR INSERT
  WITH CHECK (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY strength_sets_update ON public.strength_sets FOR UPDATE
  USING (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')))
  WITH CHECK (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY strength_sets_delete ON public.strength_sets FOR DELETE
  USING (user_id = (SELECT app.current_user_id()));

CREATE POLICY goals_select ON public.goals FOR SELECT
  USING (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY goals_insert ON public.goals FOR INSERT
  WITH CHECK (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY goals_update ON public.goals FOR UPDATE
  USING (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')))
  WITH CHECK (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY goals_delete ON public.goals FOR DELETE
  USING (user_id = (SELECT app.current_user_id()));

CREATE POLICY reminders_select ON public.reminders FOR SELECT
  USING (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY reminders_insert ON public.reminders FOR INSERT
  WITH CHECK (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY reminders_update ON public.reminders FOR UPDATE
  USING (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')))
  WITH CHECK (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY reminders_delete ON public.reminders FOR DELETE
  USING (user_id = (SELECT app.current_user_id()));
-- Sem TRUNCATE para o runtime (TRUNCATE ignora RLS).
REVOKE TRUNCATE ON public.meal_entries, public.water_entries, public.activity_entries, public.strength_sets,
  public.goals, public.reminders FROM app_user;
