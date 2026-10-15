-- AlterTable
ALTER TABLE "data_export_jobs" ADD COLUMN     "file_deleted_at" TIMESTAMPTZ(3);

-- =================================================================================================
-- Revisão de privacidade da Fase 6a (ADR-0032). Escrito à mão.
-- A1/A2/M1: o arquivo é apagado ANTES de a linha deixar de apontar para ele; falha no storage = nova tentativa.
-- B1: teto de 24 h no banco que não depende de `updated_at`. B5: linhas apagadas 2 dias depois do arquivo.
-- =================================================================================================

DROP FUNCTION app.exports_expire_due(integer);

-- ---------- B1: prazo do link nunca passa de 24 h a partir de agora e nunca aumenta ----------
CREATE FUNCTION app.data_export_jobs_guard() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW.expires_at IS NOT NULL AND NEW.expires_at > now() + interval '24 hours' THEN
    RAISE EXCEPTION 'export link longer than 24 hours' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.expires_at IS NOT NULL AND (NEW.expires_at IS NULL OR NEW.expires_at > OLD.expires_at) THEN
      RAISE EXCEPTION 'export link cannot be extended' USING ERRCODE = '23514';
    END IF;
    IF OLD.file_deleted_at IS NOT NULL AND
       (NEW.file_deleted_at IS DISTINCT FROM OLD.file_deleted_at OR NEW.status <> 'expired') THEN
      RAISE EXCEPTION 'export file already deleted' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER data_export_jobs_guard BEFORE INSERT OR UPDATE ON public.data_export_jobs
  FOR EACH ROW EXECUTE FUNCTION app.data_export_jobs_guard();

-- ---------- A2: limpeza em duas fases (job `reports.expire`, de hora em hora) ----------
-- 1) Lista o que precisa sair do storage, SEM mudar nada: vencidos, expirados (revogação, pedido apagado), falhos
--    e pedidos parados há mais de 1 h (B2). Só (id, user_id): o job deriva a chave do arquivo.
CREATE FUNCTION app.exports_cleanup_due(p_limit integer)
  RETURNS TABLE (id uuid, user_id uuid)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'invalid limit' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT j.id, j.user_id FROM public.data_export_jobs j
   WHERE j.file_deleted_at IS NULL
     AND ((j.status = 'ready' AND j.expires_at <= now())
       OR j.status IN ('expired', 'failed')
       OR (j.status IN ('queued', 'processing') AND j.updated_at < now() - interval '1 hour'))
   ORDER BY j.created_at
   LIMIT p_limit;
END;
$$;

-- 2) Depois de apagar cada arquivo: marca a linha (expirada, arquivo apagado). Só aceita linhas que a etapa 1
--    devolveria ou que já vencerem; nunca mexe em pedido válido em andamento.
CREATE FUNCTION app.exports_mark_file_deleted(p_id uuid) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.data_export_jobs j
     SET status = 'expired', file_deleted_at = now(),
         expires_at = least(coalesce(j.expires_at, now()), now()), updated_at = now()
   WHERE j.id = p_id AND j.file_deleted_at IS NULL
     AND ((j.status = 'ready' AND j.expires_at <= now())
       OR j.status IN ('expired', 'failed')
       OR (j.status IN ('queued', 'processing') AND j.updated_at < now() - interval '1 hour'));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$$;

-- 3) B5: a linha (só metadados do pedido) sai 2 dias depois do arquivo. Mantê-la esse tempo preserva a contagem
--    do limite diário mesmo quando a pessoa apaga o arquivo (B3).
CREATE FUNCTION app.exports_purge_rows() RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM public.data_export_jobs WHERE file_deleted_at < now() - interval '2 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION app.exports_cleanup_due(integer), app.exports_mark_file_deleted(uuid),
  app.exports_purge_rows() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.exports_cleanup_due(integer), app.exports_mark_file_deleted(uuid),
  app.exports_purge_rows() TO app_user;
