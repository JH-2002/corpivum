-- CreateEnum
CREATE TYPE "data_export_kind" AS ENUM ('full_export', 'report');

-- CreateEnum
CREATE TYPE "data_export_format" AS ENUM ('json', 'csv', 'pdf');

-- CreateEnum
CREATE TYPE "report_period" AS ENUM ('week', 'month', 'year');

-- CreateEnum
CREATE TYPE "data_export_status" AS ENUM ('queued', 'processing', 'ready', 'failed', 'expired');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "audit_action" ADD VALUE 'data_export_requested';
ALTER TYPE "audit_action" ADD VALUE 'data_export_downloaded';
ALTER TYPE "audit_action" ADD VALUE 'data_export_deleted';

-- AlterEnum
ALTER TYPE "audit_resource_type" ADD VALUE 'data_export';

-- CreateTable
CREATE TABLE "data_export_jobs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "data_export_kind" NOT NULL,
    "format" "data_export_format" NOT NULL,
    "report_period" "report_period",
    "period_start" DATE,
    "period_end" DATE,
    "hide_body_values" BOOLEAN NOT NULL DEFAULT false,
    "status" "data_export_status" NOT NULL DEFAULT 'queued',
    "size_bytes" INTEGER,
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "data_export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "data_export_jobs_user_id_created_at_idx" ON "data_export_jobs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "data_export_jobs_status_expires_at_idx" ON "data_export_jobs"("status", "expires_at");

-- AddForeignKey
ALTER TABLE "data_export_jobs" ADD CONSTRAINT "data_export_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =================================================================================================
-- Fase 6a (ADR-0032): exportação e relatórios (LEG-D03, §29). Tudo abaixo é escrito à mão.
-- =================================================================================================

-- ---------- Coerência ----------
ALTER TABLE public.data_export_jobs
  ADD CONSTRAINT data_export_jobs_report_period CHECK (
    (kind = 'report' AND report_period IS NOT NULL AND period_start IS NOT NULL AND period_end IS NOT NULL
       AND period_start <= period_end) OR
    (kind = 'full_export' AND report_period IS NULL AND period_start IS NULL AND period_end IS NULL)),
  -- PDF só para relatório; a portabilidade é JSON/CSV estruturado (LEG-D03).
  ADD CONSTRAINT data_export_jobs_format CHECK (kind = 'report' OR format IN ('json', 'csv')),
  ADD CONSTRAINT data_export_jobs_ready CHECK (status <> 'ready' OR (expires_at IS NOT NULL AND size_bytes IS NOT NULL)),
  -- Teto do link: 24 h (LEG-D03). O relógio do banco vale aqui, não o da aplicação.
  ADD CONSTRAINT data_export_jobs_expiry CHECK (expires_at IS NULL OR expires_at <= updated_at + interval '24 hours'),
  ADD CONSTRAINT data_export_jobs_size CHECK (size_bytes IS NULL OR size_bytes >= 0);

-- ---------- RLS: dono + consentimento de saúde (o arquivo é dado de saúde) ----------
ALTER TABLE public.data_export_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY data_export_jobs_select ON public.data_export_jobs FOR SELECT
  USING (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY data_export_jobs_insert ON public.data_export_jobs FOR INSERT
  WITH CHECK (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY data_export_jobs_update ON public.data_export_jobs FOR UPDATE
  USING (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')))
  WITH CHECK (user_id = (SELECT app.current_user_id()) AND (SELECT app.has_active_consent('health_data')));
CREATE POLICY data_export_jobs_delete ON public.data_export_jobs FOR DELETE
  USING (user_id = (SELECT app.current_user_id()));

-- Sem TRUNCATE para o runtime (TRUNCATE ignora RLS).
REVOKE TRUNCATE ON public.data_export_jobs FROM app_user;

-- ---------- Expiração (job `reports.expire`, de hora em hora) ----------
-- Sem contexto de usuário: marca como expirados os arquivos vencidos (e os pedidos parados há mais de 1 dia)
-- e devolve só (id, user_id) para o job apagar o objeto no storage. Não lê nem devolve conteúdo.
CREATE FUNCTION app.exports_expire_due(p_limit integer)
  RETURNS TABLE (id uuid, user_id uuid)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'invalid limit' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  UPDATE public.data_export_jobs j
     SET status = 'expired', updated_at = now()
   WHERE j.id IN (
     SELECT x.id FROM public.data_export_jobs x
      WHERE (x.status = 'ready' AND x.expires_at <= now())
         OR (x.status IN ('queued', 'processing', 'failed') AND x.created_at < now() - interval '1 day')
      ORDER BY x.created_at
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED)
  RETURNING j.id, j.user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION app.exports_expire_due(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.exports_expire_due(integer) TO app_user;
