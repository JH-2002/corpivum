-- =====================================================================================================
-- Escrito à mão (ADR-0036 D3, ADR-0037; LEG-S04, LEG-S05). Achados de autenticação da 7b.
-- Mesmas regras da ADR-0015: SECURITY DEFINER com search_path fixo, objetos qualificados, sem SQL dinâmico,
-- retorno mínimo.
--   PR1a-R2-B2 / P7-B2: o limite do 2º fator por conta passa a contar só falhas; a consulta sem contar é
--     `rate_limit_peek`.
--   PR1b-R2-B3: o pedido de redefinição deixa de ler `password_hash`; recebe só a impressão (SHA-256) que o
--     cookie de aparelho conhecido assina.
--   PR1a-R3-B2: o link de verificação não vale além do expurgo da conta não verificada (7 dias).
-- =====================================================================================================

-- Tentativas já contadas na janela atual da chave, sem contar esta. Mesma janela fixa de `rate_limit_hit`.
CREATE FUNCTION app.rate_limit_peek(p_key_hash bytea, p_window_seconds integer,
                                    p_now timestamptz DEFAULT now())
  RETURNS integer
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_start timestamptz;
  v_count integer;
BEGIN
  IF p_window_seconds <= 0 OR length(p_key_hash) <> 32 THEN
    RAISE EXCEPTION 'invalid rate limit arguments' USING ERRCODE = '22023';
  END IF;
  v_start := to_timestamp(floor(extract(epoch FROM p_now) / p_window_seconds) * p_window_seconds);
  SELECT b.count INTO v_count FROM public.rate_limit_buckets b
   WHERE b.key_hash = p_key_hash AND b.window_start = v_start;
  RETURN coalesce(v_count, 0);
END;
$$;

-- Pedido de redefinição: o id e a impressão do hash de senha (para conferir o cookie de aparelho), nunca o
-- hash em si.
CREATE FUNCTION app.auth_find_reset(p_email text)
  RETURNS TABLE (user_id uuid, password_fingerprint bytea)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
  SELECT u.id, pg_catalog.sha256(pg_catalog.convert_to(u.password_hash, 'UTF8'))
    FROM public.users u
   WHERE u.email = p_email AND u.deleted_at IS NULL;
$$;

-- O link de verificação vale até 24 h, mas nunca além de 7 dias depois do cadastro (o expurgo apaga a conta
-- não verificada nesse prazo).
CREATE OR REPLACE FUNCTION app.auth_issue_token(p_user_id uuid, p_purpose public.auth_token_purpose,
                                                p_token_hash bytea, p_ttl_seconds integer)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_expires timestamptz := now() + make_interval(secs => p_ttl_seconds);
BEGIN
  IF p_ttl_seconds <= 0 OR p_ttl_seconds > 86400 OR length(p_token_hash) <> 32 THEN
    RAISE EXCEPTION 'invalid token arguments' USING ERRCODE = '22023';
  END IF;
  IF p_purpose = 'verify_email' THEN
    SELECT least(v_expires, u.created_at + interval '7 days') INTO v_expires
      FROM public.users u WHERE u.id = p_user_id AND u.email_verified_at IS NULL;
    IF v_expires IS NULL THEN
      v_expires := now() + make_interval(secs => p_ttl_seconds);
    END IF;
  END IF;
  UPDATE public.auth_tokens
     SET used_at = now(), updated_at = now()
   WHERE user_id = p_user_id AND purpose = p_purpose AND used_at IS NULL;
  INSERT INTO public.auth_tokens (id, user_id, purpose, token_hash, expires_at, updated_at)
  VALUES (gen_random_uuid(), p_user_id, p_purpose, p_token_hash, v_expires, now());
END;
$$;

REVOKE EXECUTE ON FUNCTION
  app.rate_limit_peek(bytea, integer, timestamptz),
  app.auth_find_reset(text)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  app.rate_limit_peek(bytea, integer, timestamptz),
  app.auth_find_reset(text)
TO app_user;
