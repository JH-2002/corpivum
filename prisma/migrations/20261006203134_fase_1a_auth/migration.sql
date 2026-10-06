-- CreateEnum
CREATE TYPE "auth_token_purpose" AS ENUM ('verify_email', 'reset_password');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified_at" TIMESTAMPTZ(3),
    "password_hash" TEXT NOT NULL,
    "adult_attested_at" TIMESTAMPTZ(3) NOT NULL,
    "age_gate_version" TEXT NOT NULL,
    "mfa_enabled_at" TIMESTAMPTZ(3),
    "totp_secret" BYTEA,
    "totp_last_used_step" BIGINT,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "device_label" TEXT NOT NULL,
    "mfa_pending" BOOLEAN NOT NULL DEFAULT false,
    "mfa_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idle_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" BYTEA NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" "auth_token_purpose" NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_buckets" (
    "key_hash" BYTEA NOT NULL,
    "window_start" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key_hash","window_start")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "recovery_codes_code_hash_key" ON "recovery_codes"("code_hash");

-- CreateIndex
CREATE INDEX "recovery_codes_user_id_idx" ON "recovery_codes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_token_hash_key" ON "auth_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "auth_tokens_user_id_purpose_idx" ON "auth_tokens"("user_id", "purpose");

-- CreateIndex
CREATE INDEX "rate_limit_buckets_expires_at_idx" ON "rate_limit_buckets"("expires_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =====================================================================================================
-- Escrito à mão (ADR-0015, LEG-S03/LEG-S04): RLS, privilégios e funções SECURITY DEFINER do pré-login.
-- Regras para toda função SECURITY DEFINER: search_path fixo na definição, objetos qualificados com
-- schema, sem SQL dinâmico (sem EXECUTE), retorno mínimo, EXECUTE só para app_user.
-- =====================================================================================================

-- O runtime nunca toca a tabela de controle de migrações (ausente na shadow database).
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    REVOKE ALL ON TABLE public._prisma_migrations FROM app_user;
  END IF;
END;
$$;

CREATE SCHEMA app;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO app_user;
ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA app REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Usuário do contexto da transação. Ausente, vazio ou inválido => NULL => nenhuma linha passa.
CREATE FUNCTION app.current_user_id() RETURNS uuid
  LANGUAGE plpgsql STABLE
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v text := current_setting('app.user_id', true);
BEGIN
  IF v IS NULL OR v = '' THEN
    RETURN NULL;
  END IF;
  BEGIN
    RETURN v::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN NULL;
  END;
END;
$$;

-- ---------- RLS ----------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_codes ENABLE ROW LEVEL SECURITY;
-- Sem políticas: tudo negado ao runtime; acesso só pelas funções abaixo.
ALTER TABLE public.auth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_self_select ON public.users FOR SELECT
  USING (id = app.current_user_id());
CREATE POLICY users_self_update ON public.users FOR UPDATE
  USING (id = app.current_user_id()) WITH CHECK (id = app.current_user_id());

CREATE POLICY sessions_owner ON public.sessions FOR ALL
  USING (user_id = app.current_user_id()) WITH CHECK (user_id = app.current_user_id());

CREATE POLICY recovery_codes_owner ON public.recovery_codes FOR ALL
  USING (user_id = app.current_user_id()) WITH CHECK (user_id = app.current_user_id());

-- ---------- Privilégios ----------
-- Conta nasce só por app.auth_create_user; exclusão é lógica (deleted_at), purga fica para a Fase 6.
REVOKE INSERT, DELETE, TRUNCATE ON public.users FROM app_user;
REVOKE ALL ON public.auth_tokens FROM app_user;
REVOKE ALL ON public.rate_limit_buckets FROM app_user;

-- ---------- Funções SECURITY DEFINER (pré-login) ----------

-- Login: dados mínimos para verificar a senha. Conta excluída não aparece.
CREATE FUNCTION app.auth_find_login(p_email text)
  RETURNS TABLE (user_id uuid, password_hash text, mfa_enabled boolean, email_verified boolean)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
  SELECT u.id, u.password_hash, u.mfa_enabled_at IS NOT NULL, u.email_verified_at IS NOT NULL
    FROM public.users u
   WHERE u.email = p_email AND u.deleted_at IS NULL;
$$;

-- Recuperação de senha / reenvio de verificação: só o id e se o e-mail já foi verificado.
CREATE FUNCTION app.auth_find_user_id(p_email text)
  RETURNS TABLE (user_id uuid, email_verified boolean)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
  SELECT u.id, u.email_verified_at IS NOT NULL
    FROM public.users u
   WHERE u.email = p_email AND u.deleted_at IS NULL;
$$;

-- Cadastro. E-mail já existente: não cria nada e devolve (id, false) para o aviso ao dono da conta.
CREATE FUNCTION app.auth_create_user(p_email text, p_password_hash text, p_age_gate_version text)
  RETURNS TABLE (user_id uuid, created boolean)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.users AS nu (id, email, password_hash, adult_attested_at, age_gate_version, updated_at)
  VALUES (gen_random_uuid(), p_email, p_password_hash, now(), p_age_gate_version, now())
  ON CONFLICT (email) DO NOTHING
  RETURNING nu.id INTO v_id;

  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT v_id, true;
    RETURN;
  END IF;

  RETURN QUERY
    SELECT u.id, false FROM public.users u WHERE u.email = p_email AND u.deleted_at IS NULL;
END;
$$;

-- Resolve o cookie de sessão. Revogada, expirada (absoluta ou ociosa) ou conta excluída => nada.
CREATE FUNCTION app.auth_resolve_session(p_token_hash bytea)
  RETURNS TABLE (session_id uuid, user_id uuid, mfa_pending boolean, email_verified boolean,
                 last_seen_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
  SELECT s.id, s.user_id, s.mfa_pending, u.email_verified_at IS NOT NULL, s.last_seen_at
    FROM public.sessions s
    JOIN public.users u ON u.id = s.user_id
   WHERE s.token_hash = p_token_hash
     AND s.revoked_at IS NULL
     AND s.expires_at > now()
     AND s.idle_expires_at > now()
     AND u.deleted_at IS NULL;
$$;

-- Emite token de uso único. Tokens anteriores da mesma finalidade e ainda válidos são invalidados.
CREATE FUNCTION app.auth_issue_token(p_user_id uuid, p_purpose public.auth_token_purpose,
                                     p_token_hash bytea, p_ttl_seconds integer)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF p_ttl_seconds <= 0 OR p_ttl_seconds > 86400 OR length(p_token_hash) <> 32 THEN
    RAISE EXCEPTION 'invalid token arguments' USING ERRCODE = '22023';
  END IF;
  UPDATE public.auth_tokens
     SET used_at = now(), updated_at = now()
   WHERE user_id = p_user_id AND purpose = p_purpose AND used_at IS NULL;
  INSERT INTO public.auth_tokens (id, user_id, purpose, token_hash, expires_at, updated_at)
  VALUES (gen_random_uuid(), p_user_id, p_purpose, p_token_hash,
          now() + make_interval(secs => p_ttl_seconds), now());
END;
$$;

-- Consome token de forma atômica: só funciona uma vez, dentro do prazo e para a finalidade certa.
CREATE FUNCTION app.auth_consume_token(p_token_hash bytea, p_purpose public.auth_token_purpose)
  RETURNS uuid
  LANGUAGE sql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
  UPDATE public.auth_tokens t
     SET used_at = now(), updated_at = now()
    FROM public.users u
   WHERE t.token_hash = p_token_hash
     AND t.purpose = p_purpose
     AND t.used_at IS NULL
     AND t.expires_at > now()
     AND u.id = t.user_id
     AND u.deleted_at IS NULL
  RETURNING t.user_id;
$$;

-- Limite de tentativas em janela fixa. Conta toda tentativa; devolve se ainda está dentro do limite.
CREATE FUNCTION app.rate_limit_hit(p_key_hash bytea, p_window_seconds integer, p_max integer,
                                   p_now timestamptz DEFAULT now())
  RETURNS TABLE (allowed boolean, hits integer)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_start timestamptz;
  v_count integer;
BEGIN
  IF p_window_seconds <= 0 OR p_max <= 0 OR length(p_key_hash) <> 32 THEN
    RAISE EXCEPTION 'invalid rate limit arguments' USING ERRCODE = '22023';
  END IF;
  v_start := to_timestamp(floor(extract(epoch FROM p_now) / p_window_seconds) * p_window_seconds);

  INSERT INTO public.rate_limit_buckets AS b (key_hash, window_start, count, expires_at, updated_at)
  VALUES (p_key_hash, v_start, 1, v_start + make_interval(secs => p_window_seconds), p_now)
  ON CONFLICT (key_hash, window_start)
    DO UPDATE SET count = b.count + 1, updated_at = p_now
  RETURNING b.count INTO v_count;

  -- Limpeza oportunista das janelas vencidas desta chave.
  DELETE FROM public.rate_limit_buckets AS old
   WHERE old.key_hash = p_key_hash AND old.expires_at <= p_now;

  RETURN QUERY SELECT v_count <= p_max, v_count;
END;
$$;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  app.current_user_id(),
  app.auth_find_login(text),
  app.auth_find_user_id(text),
  app.auth_create_user(text, text, text),
  app.auth_resolve_session(bytea),
  app.auth_issue_token(uuid, public.auth_token_purpose, bytea, integer),
  app.auth_consume_token(bytea, public.auth_token_purpose),
  app.rate_limit_hit(bytea, integer, integer, timestamptz)
TO app_user;
