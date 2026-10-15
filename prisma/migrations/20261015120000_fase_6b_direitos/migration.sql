-- AlterEnum
ALTER TYPE "audit_action" ADD VALUE 'privacy_request_closed';
ALTER TYPE "audit_action" ADD VALUE 'privacy_request_contact_read';
ALTER TYPE "audit_action" ADD VALUE 'account_deletion_requested';
ALTER TYPE "audit_action" ADD VALUE 'account_deleted';
ALTER TYPE "audit_action" ADD VALUE 'account_deletion_notice_sent';
ALTER TYPE "audit_action" ADD VALUE 'account_purged';

-- =====================================================================================================
-- Escrito à mão (ADR-0034; LEG-D01, D04, D06, D07, R03, S06). Pedidos do titular, exclusão de conta de
-- adulto com purga imediata e o papel `app_operator` do atendimento manual.
-- Mesmas regras da ADR-0015: SECURITY DEFINER com search_path fixo, objetos qualificados, sem SQL dinâmico,
-- retorno mínimo. Os valores novos de `audit_action` só aparecem em corpos plpgsql (validados na execução,
-- depois do commit desta migração).
-- =====================================================================================================

-- O papel do atendimento manual é criado fora das migrações (o app_migrator não cria papéis):
-- docker/postgres/init/03-operator-role.sh (dev/CI) e o runbook de produção (Fase 7).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'app_operator') THEN
    RAISE EXCEPTION 'papel app_operator ausente: rode pnpm db:operator:init (docs/runbooks/LOCAL_DEV.md)';
  END IF;
END;
$$;

GRANT USAGE ON SCHEMA app TO app_operator;

-- ---------- Reautenticação: novo propósito `account_deletion` (2 min, uso único) ----------
CREATE OR REPLACE FUNCTION app.reauth_issue(p_purpose text, p_token_hash bytea) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_user uuid := app.current_user_id();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'reauth requires user context' USING ERRCODE = '42501';
  END IF;
  IF p_purpose NOT IN ('minor_closure', 'account_deletion') OR length(p_token_hash) <> 32 THEN
    RAISE EXCEPTION 'invalid reauth arguments' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.reauth_proofs r
   WHERE r.user_id = v_user AND (r.expires_at < now() OR r.used_at IS NOT NULL);
  INSERT INTO public.reauth_proofs (id, user_id, purpose, token_hash, expires_at, created_at, updated_at)
  VALUES (gen_random_uuid(), v_user, p_purpose, p_token_hash, now() + interval '2 minutes', now(), now());
END;
$$;

-- ---------- Pedidos do titular (LEG-D07) ----------
-- Abre um pedido da própria pessoa. Idempotente: com pedido aberto do mesmo tipo, devolve esse. Prazo de 15
-- dias (art. 19, II). `confirmation_access` e `sharing_info` são atendidos na hora, na própria tela: já
-- nascem concluídos. Teto de 10 pedidos novos por pessoa em 24 h (cada um gera um recibo por e-mail).
CREATE FUNCTION app.privacy_request_open(p_kind public.privacy_request_kind)
  RETURNS TABLE (request_id uuid, request_status public.privacy_request_status, opened_at timestamptz,
                 due timestamptz, created boolean)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_user uuid := app.current_user_id();
  v_id uuid := gen_random_uuid();
  v_status public.privacy_request_status;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'privacy request requires user context' USING ERRCODE = '42501';
  END IF;
  IF p_kind IS NULL OR p_kind::text NOT IN
       ('confirmation_access', 'correction', 'portability', 'sharing_info', 'anonymization') THEN
    RAISE EXCEPTION 'invalid privacy request kind' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('privacy.request'), hashtext(v_user::text));
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_user AND u.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'account not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
    SELECT r.id, r.status, r.created_at, r.due_at, false
      FROM public.privacy_requests r
     WHERE r.user_id = v_user AND r.kind = p_kind AND r.status IN ('open', 'in_progress')
     ORDER BY r.created_at DESC
     LIMIT 1;
  IF FOUND THEN
    RETURN;
  END IF;

  IF (SELECT count(*) FROM public.privacy_requests r
       WHERE r.user_id = v_user AND r.created_at > now() - interval '24 hours'
         AND r.kind::text IN ('confirmation_access', 'correction', 'portability', 'sharing_info',
                              'anonymization')) >= 10 THEN
    RAISE EXCEPTION 'privacy request rate exceeded' USING ERRCODE = '54000';
  END IF;

  v_status := CASE WHEN p_kind::text IN ('confirmation_access', 'sharing_info') THEN 'completed'
                   WHEN p_kind::text = 'portability' THEN 'in_progress'
                   ELSE 'open' END;
  INSERT INTO public.privacy_requests (id, user_id, kind, status, due_at, closed_at, created_at, updated_at)
  VALUES (v_id, v_user, p_kind, v_status, now() + interval '15 days',
          CASE WHEN v_status = 'completed' THEN now() END, now(), now());
  INSERT INTO public.audit_logs (id, actor_user_id, subject_user_id, action, resource_type, resource_id,
                                 created_at, updated_at)
  VALUES (gen_random_uuid(), v_user, v_user, 'privacy_request_created', 'privacy_request', v_id, now(), now());
  IF v_status = 'completed' THEN
    INSERT INTO public.audit_logs (id, actor_user_id, subject_user_id, action, resource_type, resource_id,
                                   created_at, updated_at)
    VALUES (gen_random_uuid(), NULL, v_user, 'privacy_request_closed', 'privacy_request', v_id, now(), now());
  END IF;

  RETURN QUERY
    SELECT r.id, r.status, r.created_at, r.due_at, true FROM public.privacy_requests r WHERE r.id = v_id;
END;
$$;

-- Fechamento automático da portabilidade: conclui os pedidos abertos da própria pessoa quando há uma
-- exportação completa pronta e dentro do prazo. Chamada depois de abrir o pedido e quando a geração termina.
CREATE FUNCTION app.privacy_requests_close_portability() RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_user uuid := app.current_user_id();
  v_id uuid;
  v_count integer := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'privacy request requires user context' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.data_export_jobs j
                  WHERE j.user_id = v_user AND j.kind = 'full_export' AND j.status = 'ready'
                    AND j.expires_at > now() AND j.file_deleted_at IS NULL) THEN
    RETURN 0;
  END IF;
  FOR v_id IN
    UPDATE public.privacy_requests r SET status = 'completed', closed_at = now(), updated_at = now()
     WHERE r.user_id = v_user AND r.kind = 'portability' AND r.status IN ('open', 'in_progress')
    RETURNING r.id
  LOOP
    INSERT INTO public.audit_logs (id, actor_user_id, subject_user_id, action, resource_type, resource_id,
                                   created_at, updated_at)
    VALUES (gen_random_uuid(), NULL, v_user, 'privacy_request_closed', 'privacy_request', v_id, now(), now());
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- Prazos (job diário `privacy.request_deadlines`): só as contagens, sem IDs nem pessoas.
CREATE FUNCTION app.privacy_request_deadlines()
  RETURNS TABLE (due_soon integer, overdue integer)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
  SELECT count(*) FILTER (WHERE r.due_at >= now() AND r.due_at < now() + interval '3 days')::int,
         count(*) FILTER (WHERE r.due_at < now())::int
    FROM public.privacy_requests r
   WHERE r.status IN ('open', 'in_progress');
$$;

-- ---------- Exclusão de conta de adulto (LEG-D04, purga imediata) ----------
-- Só a própria conta (contexto da transação), com prova de reautenticação `account_deletion` de uso único.
-- Corta o acesso na hora (deleted_at + sessões revogadas: login, sessão e tokens já filtram deleted_at),
-- revoga os consentimentos e abre o pedido `deletion` em andamento. A purga roda em seguida, no job
-- `privacy.account_purge` (app.account_purge). Devolve o id do pedido.
CREATE FUNCTION app.account_delete(p_proof_hash bytea) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_user uuid := app.current_user_id();
  v_request uuid := gen_random_uuid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'account deletion requires user context' USING ERRCODE = '42501';
  END IF;
  UPDATE public.reauth_proofs r SET used_at = now(), updated_at = now()
   WHERE r.user_id = v_user AND r.purpose = 'account_deletion' AND r.token_hash = p_proof_hash
     AND r.used_at IS NULL AND r.expires_at > now();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reauthentication required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.users u SET deleted_at = now(), updated_at = now()
   WHERE u.id = v_user AND u.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'account not found' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.sessions s SET revoked_at = now(), updated_at = now()
   WHERE s.user_id = v_user AND s.revoked_at IS NULL;
  UPDATE public.auth_tokens t SET used_at = now(), updated_at = now()
   WHERE t.user_id = v_user AND t.used_at IS NULL;
  UPDATE public.consent_records c SET revoked_at = now(), updated_at = now()
   WHERE c.user_id = v_user AND c.revoked_at IS NULL;
  -- Os links de exportação deixam de valer na hora; os arquivos saem na purga.
  UPDATE public.data_export_jobs j
     SET status = 'expired', expires_at = least(coalesce(j.expires_at, now()), now()), updated_at = now()
   WHERE j.user_id = v_user AND j.status = 'ready';
  INSERT INTO public.privacy_requests (id, user_id, kind, status, due_at, created_at, updated_at)
  VALUES (v_request, v_user, 'deletion', 'in_progress', now() + interval '15 days', now(), now());
  INSERT INTO public.audit_logs (id, actor_user_id, subject_user_id, action, resource_type, resource_id,
                                 created_at, updated_at)
  VALUES (gen_random_uuid(), v_user, v_user, 'account_deletion_requested', 'privacy_request', v_request,
          now(), now()),
         (gen_random_uuid(), NULL, v_user, 'account_deleted', 'user', NULL, now(), now());
  RETURN v_request;
END;
$$;

-- Último passo da purga, na transação do job (contexto da pessoa), depois dos eliminadores e dos arquivos:
-- só para conta já excluída. Conclui o pedido `deletion` (e os demais abertos, que perdem o objeto), grava
-- `account_purged` e apaga a conta (sessões, tokens e dados saem em cascata; as provas ficam, sem FK).
-- O e-mail fica livre para um novo cadastro. Conta inexistente ou não excluída: false, nada muda.
CREATE FUNCTION app.account_purge() RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_user uuid := app.current_user_id();
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'account purge requires user context' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.users u WHERE u.id = v_user AND u.deleted_at IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  FOR v_id IN
    UPDATE public.privacy_requests r SET status = 'completed', closed_at = now(), updated_at = now()
     WHERE r.user_id = v_user AND r.status IN ('open', 'in_progress')
    RETURNING r.id
  LOOP
    INSERT INTO public.audit_logs (id, actor_user_id, subject_user_id, action, resource_type, resource_id,
                                   created_at, updated_at)
    VALUES (gen_random_uuid(), NULL, v_user, 'privacy_request_closed', 'privacy_request', v_id, now(), now());
  END LOOP;
  INSERT INTO public.audit_logs (id, actor_user_id, subject_user_id, action, resource_type, resource_id,
                                 created_at, updated_at)
  VALUES (gen_random_uuid(), NULL, v_user, 'account_purged', 'user', NULL, now(), now());
  DELETE FROM public.users u WHERE u.id = v_user;
  RETURN true;
END;
$$;

-- Rede de segurança (job diário `privacy.account_purge_sweep`): contas excluídas que ainda existem.
CREATE FUNCTION app.account_purge_due(p_limit integer)
  RETURNS TABLE (user_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
  SELECT u.id FROM public.users u
   WHERE u.deleted_at IS NOT NULL
   ORDER BY u.deleted_at
   LIMIT least(greatest(p_limit, 1), 1000);
$$;

-- ---------- Atendimento manual (papel app_operator, sem BYPASSRLS e sem acesso a tabelas) ----------
-- Pedidos em aberto, sem e-mail nem pessoa.
CREATE FUNCTION app.operator_requests_due()
  RETURNS TABLE (request_id uuid, kind public.privacy_request_kind, status public.privacy_request_status,
                 opened_at timestamptz, due timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
  SELECT r.id, r.kind, r.status, r.created_at, r.due_at
    FROM public.privacy_requests r
   WHERE r.status IN ('open', 'in_progress')
   ORDER BY r.due_at, r.id
   LIMIT 500;
$$;

-- E-mail da conta de um pedido em aberto, para o encarregado responder. Cada leitura fica no AuditLog
-- (`privacy_request_contact_read`, sem ator humano identificável no banco). Conta excluída: NULL.
CREATE FUNCTION app.operator_request_contact(p_id uuid) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_user uuid;
  v_email text;
BEGIN
  SELECT r.user_id INTO v_user FROM public.privacy_requests r
   WHERE r.id = p_id AND r.status IN ('open', 'in_progress');
  IF v_user IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT u.email INTO v_email FROM public.users u WHERE u.id = v_user AND u.deleted_at IS NULL;
  IF v_email IS NULL THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.audit_logs (id, actor_user_id, subject_user_id, action, resource_type, resource_id,
                                 created_at, updated_at)
  VALUES (gen_random_uuid(), NULL, v_user, 'privacy_request_contact_read', 'privacy_request', p_id,
          now(), now());
  RETURN v_email;
END;
$$;

-- Fecha um pedido em aberto atendido fora do app. A exclusão e o encerramento de menor são do sistema.
CREATE FUNCTION app.operator_request_close(p_id uuid, p_status public.privacy_request_status)
  RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_user uuid;
BEGIN
  IF p_status IS NULL OR p_status::text NOT IN ('completed', 'rejected') THEN
    RAISE EXCEPTION 'invalid status' USING ERRCODE = '22023';
  END IF;
  UPDATE public.privacy_requests r SET status = p_status, closed_at = now(), updated_at = now()
   WHERE r.id = p_id AND r.status IN ('open', 'in_progress')
     AND r.kind::text NOT IN ('deletion', 'minor_closure')
  RETURNING r.user_id INTO v_user;
  IF v_user IS NULL THEN
    RETURN false;
  END IF;
  INSERT INTO public.audit_logs (id, actor_user_id, subject_user_id, action, resource_type, resource_id,
                                 created_at, updated_at)
  VALUES (gen_random_uuid(), NULL, v_user, 'privacy_request_closed', 'privacy_request', p_id, now(), now());
  RETURN true;
END;
$$;

-- ---------- Privilégios ----------
REVOKE EXECUTE ON FUNCTION
  app.privacy_request_open(public.privacy_request_kind),
  app.privacy_requests_close_portability(),
  app.privacy_request_deadlines(),
  app.account_delete(bytea),
  app.account_purge(),
  app.account_purge_due(integer),
  app.operator_requests_due(),
  app.operator_request_contact(uuid),
  app.operator_request_close(uuid, public.privacy_request_status)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  app.privacy_request_open(public.privacy_request_kind),
  app.privacy_requests_close_portability(),
  app.privacy_request_deadlines(),
  app.account_delete(bytea),
  app.account_purge(),
  app.account_purge_due(integer)
TO app_user;
-- O operador só executa estas três; nada de tabela, nada das funções do runtime.
GRANT EXECUTE ON FUNCTION
  app.operator_requests_due(),
  app.operator_request_contact(uuid),
  app.operator_request_close(uuid, public.privacy_request_status)
TO app_operator;
