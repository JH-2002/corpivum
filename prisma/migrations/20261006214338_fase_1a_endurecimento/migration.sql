-- Endurecimento após a revisão de privacidade da Fase 1a (ADR-0017). Escrito à mão.

-- ---------- RLS: função de contexto avaliada uma vez por consulta (initplan), não por linha ----------
DROP POLICY users_self_select ON public.users;
DROP POLICY users_self_update ON public.users;
DROP POLICY sessions_owner ON public.sessions;
DROP POLICY recovery_codes_owner ON public.recovery_codes;

CREATE POLICY users_self_select ON public.users FOR SELECT
  USING (id = (SELECT app.current_user_id()));
CREATE POLICY users_self_update ON public.users FOR UPDATE
  USING (id = (SELECT app.current_user_id())) WITH CHECK (id = (SELECT app.current_user_id()));

CREATE POLICY sessions_owner ON public.sessions FOR ALL
  USING (user_id = (SELECT app.current_user_id()))
  WITH CHECK (user_id = (SELECT app.current_user_id()));

CREATE POLICY recovery_codes_owner ON public.recovery_codes FOR ALL
  USING (user_id = (SELECT app.current_user_id()))
  WITH CHECK (user_id = (SELECT app.current_user_id()));

-- ---------- users: UPDATE só nas colunas que o runtime precisa alterar ----------
-- id, email, adult_attested_at, age_gate_version e created_at ficam imutáveis para o runtime.
REVOKE UPDATE ON public.users FROM app_user;
GRANT UPDATE (email_verified_at, password_hash, mfa_enabled_at, totp_secret, totp_last_used_step,
              deleted_at, updated_at)
  ON public.users TO app_user;

-- ---------- Expurgo de dados de autenticação vencidos (ROPA T1/T5) ----------
-- Sessões: revogadas ou expiradas há mais de 1 dia. Tokens: usados ou vencidos há mais de 1 dia.
-- Janelas de limite: encerradas. O dia de folga mantém o rastro curto para investigar abuso recente.
CREATE FUNCTION app.auth_purge_expired()
  RETURNS TABLE (sessions integer, tokens integer, buckets integer)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_sessions integer;
  v_tokens integer;
  v_buckets integer;
BEGIN
  DELETE FROM public.sessions s
   WHERE coalesce(s.revoked_at, least(s.expires_at, s.idle_expires_at)) < now() - interval '1 day';
  GET DIAGNOSTICS v_sessions = ROW_COUNT;

  DELETE FROM public.auth_tokens t
   WHERE coalesce(t.used_at, t.expires_at) < now() - interval '1 day';
  GET DIAGNOSTICS v_tokens = ROW_COUNT;

  DELETE FROM public.rate_limit_buckets b WHERE b.expires_at <= now();
  GET DIAGNOSTICS v_buckets = ROW_COUNT;

  RETURN QUERY SELECT v_sessions, v_tokens, v_buckets;
END;
$$;

REVOKE EXECUTE ON FUNCTION app.auth_purge_expired() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.auth_purge_expired() TO app_user;
