-- =================================================================================================
-- Segunda revisão do privacy-reviewer da Fase 7e (ADR-0040). Escrito à mão.
-- N1: a trava de "acesso liberado" dependia do ponto digitado igual; outro `--since` passava e contas criadas depois
-- da troca seriam purgadas. N2: um `--since` anterior ao ponto real refaria eliminações que já tinham terminado antes
-- do backup, apagando dados registrados depois delas.
-- `app.restore_begin` roda ANTES de tudo (inclusive do plano) e fixa o ponto deste restore:
--   - primeira vez (nenhuma execução depois do ponto informado): o ponto não pode ser anterior a nenhum dado
--     restaurado (contas, AuditLog, registros de acesso); grava a execução;
--   - depois: o ponto precisa ser o mesmo da primeira execução.
-- E nada roda se houver conta ou sessão criada depois do início deste restore (acesso liberado).
-- =================================================================================================

CREATE FUNCTION app.restore_begin(p_since timestamptz) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_latest timestamptz;
BEGIN
  -- Uma execução de restore que veio dentro do backup é anterior ao ponto; as deste restore são posteriores.
  IF NOT EXISTS (SELECT 1 FROM app.restore_runs r WHERE r.ran_at > p_since) THEN
    SELECT greatest((SELECT max(u.created_at) FROM public.users u),
                    (SELECT max(a.created_at) FROM public.audit_logs a),
                    (SELECT max(x.created_at) FROM public.access_logs x))
      INTO v_latest;
    -- 5 minutos de tolerância: parte das datas vem do relógio da aplicação (`@default(now())` do Prisma).
    IF v_latest IS NOT NULL AND p_since < v_latest - interval '5 minutes' THEN
      RAISE EXCEPTION 'backup point earlier than the restored data' USING ERRCODE = '22023';
    END IF;
    INSERT INTO app.restore_runs (backup_point) VALUES (p_since);
  ELSIF EXISTS (SELECT 1 FROM app.restore_runs r
                 WHERE r.ran_at > p_since AND r.backup_point <> p_since) THEN
    RAISE EXCEPTION 'backup point differs from the first run of this restore' USING ERRCODE = '22023';
  END IF;
  PERFORM app.restore_assert_not_released(p_since);
END;
$$;

CREATE OR REPLACE FUNCTION app.restore_assert_not_released(p_since timestamptz) RETURNS void
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_first timestamptz := (SELECT min(r.ran_at) FROM app.restore_runs r WHERE r.ran_at > p_since);
BEGIN
  IF v_first IS NULL THEN
    RAISE EXCEPTION 'restore not started (app.restore_begin)' USING ERRCODE = '55000';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sessions s WHERE s.created_at > v_first)
     OR EXISTS (SELECT 1 FROM public.users u WHERE u.created_at > v_first) THEN
    RAISE EXCEPTION 'access already released after the restore' USING ERRCODE = '55000';
  END IF;
END;
$$;

-- O registro da execução passa a ser do `restore_begin`.
CREATE OR REPLACE FUNCTION app.restore_reset_access(p_since timestamptz) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_sessions integer;
  v_tokens integer;
  v_proofs integer;
  v_exports integer;
  v_unverified integer;
BEGIN
  PERFORM app.restore_assert_not_released(p_since);
  UPDATE public.sessions s SET revoked_at = now(), updated_at = now() WHERE s.revoked_at IS NULL;
  GET DIAGNOSTICS v_sessions = ROW_COUNT;
  DELETE FROM public.auth_tokens;
  GET DIAGNOSTICS v_tokens = ROW_COUNT;
  DELETE FROM public.reauth_proofs;
  GET DIAGNOSTICS v_proofs = ROW_COUNT;
  UPDATE public.data_export_jobs j
     SET status = 'expired', expires_at = least(coalesce(j.expires_at, now()), now()), updated_at = now()
   WHERE j.file_deleted_at IS NULL AND j.status <> 'expired';
  GET DIAGNOSTICS v_exports = ROW_COUNT;
  SELECT p.unverified_users INTO v_unverified FROM app.auth_purge_expired() p;
  INSERT INTO public.audit_logs (id, actor_user_id, subject_user_id, action, resource_type, resource_id,
                                 operator_role, created_at, updated_at)
  VALUES (gen_random_uuid(), NULL, NULL, 'restore_reapplied', 'user', NULL, session_user, now(), now());
  RETURN jsonb_build_object('sessions', v_sessions, 'tokens', v_tokens, 'reauthProofs', v_proofs,
                            'exports', v_exports, 'unverifiedUsers', coalesce(v_unverified, 0));
END;
$$;

REVOKE EXECUTE ON FUNCTION app.restore_begin(timestamptz)
  FROM PUBLIC, app_user, app_worker, app_operator, app_backup;
