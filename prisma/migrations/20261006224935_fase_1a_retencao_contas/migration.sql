-- Segunda revisão de privacidade da Fase 1a (ADR-0018). M1: retenção de contas não verificadas e de
-- segredos TOTP de ativações abandonadas.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "totp_setup_started_at" TIMESTAMPTZ(3);

-- Coluna nova também entra na lista de colunas que o runtime pode alterar (ADR-0017).
GRANT UPDATE (totp_setup_started_at) ON public.users TO app_user;

-- Expurgo ampliado (ROPA T1):
--   * conta com e-mail nunca verificado: apagada 7 dias após o cadastro (sessões, tokens e códigos em CASCADE);
--   * segredo TOTP de ativação não concluída: apagado 1 dia após o início.
DROP FUNCTION app.auth_purge_expired();

CREATE FUNCTION app.auth_purge_expired()
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

  UPDATE public.users u
     SET totp_secret = NULL, totp_last_used_step = NULL, totp_setup_started_at = NULL,
         updated_at = now()
   WHERE u.mfa_enabled_at IS NULL AND u.totp_secret IS NOT NULL
     AND coalesce(u.totp_setup_started_at, u.updated_at) < now() - interval '1 day';
  GET DIAGNOSTICS v_totp = ROW_COUNT;

  DELETE FROM public.sessions s
   WHERE coalesce(s.revoked_at, least(s.expires_at, s.idle_expires_at)) < now() - interval '1 day';
  GET DIAGNOSTICS v_sessions = ROW_COUNT;

  DELETE FROM public.auth_tokens t
   WHERE coalesce(t.used_at, t.expires_at) < now() - interval '1 day';
  GET DIAGNOSTICS v_tokens = ROW_COUNT;

  DELETE FROM public.rate_limit_buckets b WHERE b.expires_at <= now();
  GET DIAGNOSTICS v_buckets = ROW_COUNT;

  RETURN QUERY SELECT v_sessions, v_tokens, v_buckets, v_users, v_totp;
END;
$$;

REVOKE EXECUTE ON FUNCTION app.auth_purge_expired() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.auth_purge_expired() TO app_user;
