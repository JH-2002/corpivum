-- =====================================================================================================
-- Escrito à mão (ADR-0037; LEG-F05, LEG-C04). PR4-B1: reconciliação diária dos lembretes.
-- Mesmas regras da ADR-0015: SECURITY DEFINER com search_path fixo, objetos qualificados, sem SQL dinâmico,
-- retorno mínimo (só IDs). Só o `app_worker` executa.
-- =====================================================================================================

-- Lembretes ligados de contas ativas com consentimento `health_data` vigente (mesma regra de
-- `app.has_active_consent`), em páginas por id. O job reagenda a próxima ocorrência de cada um; a chave única
-- do job (lembrete + ocorrência) impede cadeia duplicada.
CREATE FUNCTION app.reminders_active(p_after uuid, p_limit integer)
  RETURNS TABLE (reminder_id uuid, user_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
  SELECT r.id, r.user_id
    FROM public.reminders r
    JOIN public.users u ON u.id = r.user_id AND u.deleted_at IS NULL
   WHERE r.enabled AND (p_after IS NULL OR r.id > p_after)
     AND EXISTS (
       SELECT 1
         FROM public.consent_records c
         JOIN public.policy_versions v ON v.id = c.policy_version_id
        WHERE c.user_id = r.user_id AND c.purpose = 'health_data' AND c.revoked_at IS NULL
          AND v.version >= coalesce((
                SELECT max(l.version) FROM public.policy_versions l
                 WHERE l.document = v.document AND l.requires_reconsent AND l.published_at <= now()), 0))
   ORDER BY r.id
   LIMIT least(greatest(p_limit, 1), 1000);
$$;

REVOKE EXECUTE ON FUNCTION app.reminders_active(uuid, integer) FROM PUBLIC, app_user;
GRANT EXECUTE ON FUNCTION app.reminders_active(uuid, integer) TO app_worker;
