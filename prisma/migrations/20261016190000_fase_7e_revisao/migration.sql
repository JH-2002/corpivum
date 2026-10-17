-- =================================================================================================
-- Revisão do privacy-reviewer da Fase 7e (ADR-0040). Escrito à mão.
-- A1: livro lido antes do backup é recusado. A2: livro e banco restaurado amarrados pela identidade da
-- instalação; plano (simulação) antes de reaplicar; nada roda depois de o acesso ser liberado. M1: margem para
-- transações em curso no instante do snapshot. M3: papel app_backup só com o livro. B1: a cópia das provas não
-- rebaixa pedido fechado.
-- =================================================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_backup') THEN
    RAISE EXCEPTION 'papel app_backup ausente: rode pnpm db:backup:init (docker/postgres/init/05-backup-role.sh)';
  END IF;
END
$$;

-- ---------- A2: identidade da instalação ----------
-- Uma linha, criada uma vez. Vai no backup: o banco restaurado tem a mesma identidade da origem, e um livro de
-- outra base (staging, instância nova e vazia) é recusado. Sem acesso de nenhum papel da aplicação.
CREATE TABLE app.installation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  singleton boolean NOT NULL DEFAULT true UNIQUE CHECK (singleton)
);
INSERT INTO app.installation DEFAULT VALUES;
REVOKE ALL ON app.installation FROM PUBLIC;

-- Cada reaplicação deste restore (identificado pelo ponto do backup). Um restore antigo que veio dentro do backup
-- tem outro ponto e não conta.
CREATE TABLE app.restore_runs (
  backup_point timestamptz NOT NULL,
  ran_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON app.restore_runs FROM PUBLIC;

-- ---------- M3: o livro sem a credencial do dono ----------
CREATE OR REPLACE FUNCTION app.restore_ledger(p_since timestamptz) RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
  SELECT jsonb_build_object(
    'version', 1,
    'installation', (SELECT i.id FROM app.installation i),
    'since', p_since,
    'readAt', now(),
    'users', coalesce((SELECT jsonb_agg(jsonb_build_object(
                                 'id', u.id, 'deleted_at', u.deleted_at,
                                 'health_data_purge_at', u.health_data_purge_at))
                         FROM public.users u), '[]'::jsonb),
    'consent_records', coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM public.consent_records c
        WHERE greatest(c.created_at, c.updated_at, coalesce(c.revoked_at, c.created_at)) > p_since),
        '[]'::jsonb),
    'policy_acceptances', coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM public.policy_acceptances a
        WHERE greatest(a.created_at, a.accepted_at) > p_since), '[]'::jsonb),
    'privacy_requests', coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM public.privacy_requests r
        WHERE greatest(r.created_at, r.updated_at, coalesce(r.closed_at, r.created_at)) > p_since),
        '[]'::jsonb),
    'audit_logs', coalesce((SELECT jsonb_agg(to_jsonb(l)) FROM public.audit_logs l
        WHERE l.created_at > p_since), '[]'::jsonb),
    'access_logs', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM public.access_logs x
        WHERE greatest(x.created_at, x.occurred_at) > p_since), '[]'::jsonb)
  );
$$;

GRANT USAGE ON SCHEMA app TO app_backup;
GRANT EXECUTE ON FUNCTION app.restore_ledger(timestamptz) TO app_backup;

-- ---------- A1/A2: conferências antes de qualquer mudança no banco restaurado ----------
-- Acesso já liberado: houve reaplicação e depois dela alguém entrou (sessão nova). Rodar de novo com a origem
-- antiga apagaria as contas criadas depois da troca.
CREATE FUNCTION app.restore_assert_not_released(p_since timestamptz) RETURNS void
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.sessions s
              WHERE s.created_at > (SELECT min(r.ran_at) FROM app.restore_runs r
                                     WHERE r.backup_point = p_since)) THEN
    RAISE EXCEPTION 'access already released after the restore' USING ERRCODE = '55000';
  END IF;
END;
$$;

CREATE FUNCTION app.restore_assert_ledger(p_ledger jsonb, p_since timestamptz) RETURNS void
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF p_ledger ->> 'version' IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'invalid ledger' USING ERRCODE = '22023';
  END IF;
  IF p_ledger ->> 'installation' IS DISTINCT FROM (SELECT i.id::text FROM app.installation i) THEN
    RAISE EXCEPTION 'ledger from another installation' USING ERRCODE = '22023';
  END IF;
  -- Livro que começa depois do ponto: perderia as mudanças entre os dois.
  IF (p_ledger ->> 'since')::timestamptz > p_since THEN
    RAISE EXCEPTION 'ledger starts after the backup point' USING ERRCODE = '22023';
  END IF;
  -- Livro lido antes do backup: as contas criadas entre a leitura e o backup pareceriam excluídas.
  IF (p_ledger ->> 'readAt')::timestamptz < (SELECT max(u.created_at) FROM public.users u) THEN
    RAISE EXCEPTION 'ledger older than the restored data' USING ERRCODE = '22023';
  END IF;
  PERFORM app.restore_assert_not_released(p_since);
END;
$$;

-- ---------- Plano (simulação): só contagens, nada muda ----------
CREATE FUNCTION app.restore_plan(p_ledger jsonb, p_since timestamptz) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_unverified integer;
  v_closures integer;
  v_health integer;
BEGIN
  PERFORM app.restore_assert_ledger(p_ledger, p_since);
  SELECT count(*) FILTER (WHERE u.email_verified_at IS NULL),
         count(*) FILTER (WHERE u.email_verified_at IS NOT NULL)
    INTO v_unverified, v_closures
    FROM public.users u
    LEFT JOIN jsonb_to_recordset(p_ledger -> 'users') AS s(id uuid, deleted_at timestamptz) ON s.id = u.id
   WHERE s.id IS NULL OR s.deleted_at IS NOT NULL;
  SELECT count(DISTINCT a.subject_user_id) INTO v_health
    FROM jsonb_to_recordset(p_ledger -> 'audit_logs') AS a(subject_user_id uuid, action text,
                                                           created_at timestamptz)
    JOIN public.users u ON u.id = a.subject_user_id AND u.deleted_at IS NULL
    JOIN jsonb_to_recordset(p_ledger -> 'users') AS s(id uuid, deleted_at timestamptz)
      ON s.id = u.id AND s.deleted_at IS NULL
   WHERE a.action = 'health_data_eliminated'
     AND (a.created_at > p_since OR u.health_data_purge_at IS NOT NULL);
  RETURN jsonb_build_object('users', (SELECT count(*) FROM public.users), 'unverified', v_unverified,
                            'closures', v_closures, 'health', v_health);
END;
$$;

-- ---------- B1: a cópia das provas nunca reabre pedido fechado ----------
DROP FUNCTION app.restore_apply_proofs(jsonb);
CREATE FUNCTION app.restore_apply_proofs(p_ledger jsonb, p_since timestamptz) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_total integer := 0;
  v_rows integer;
BEGIN
  PERFORM app.restore_assert_ledger(p_ledger, p_since);
  ALTER TABLE public.consent_records DISABLE TRIGGER consent_records_guard;
  ALTER TABLE public.policy_acceptances DISABLE TRIGGER policy_acceptances_guard;

  INSERT INTO public.consent_records
  SELECT * FROM jsonb_populate_recordset(NULL::public.consent_records, p_ledger -> 'consent_records')
  ON CONFLICT (id) DO UPDATE
    SET revoked_at = coalesce(EXCLUDED.revoked_at, public.consent_records.revoked_at),
        updated_at = EXCLUDED.updated_at;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_total := v_total + v_rows;

  INSERT INTO public.policy_acceptances
  SELECT * FROM jsonb_populate_recordset(NULL::public.policy_acceptances, p_ledger -> 'policy_acceptances')
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_total := v_total + v_rows;

  -- Pedido já fechado no banco restaurado (pela purga desta reaplicação) não volta a "em andamento" por causa de
  -- uma origem em que a purga ainda não tinha rodado.
  INSERT INTO public.privacy_requests AS r
  SELECT * FROM jsonb_populate_recordset(NULL::public.privacy_requests, p_ledger -> 'privacy_requests')
  ON CONFLICT (id) DO UPDATE
    SET status = CASE WHEN r.status::text IN ('completed', 'rejected')
                       AND EXCLUDED.status::text IN ('open', 'in_progress')
                      THEN r.status ELSE EXCLUDED.status END,
        closed_at = CASE WHEN r.status::text IN ('completed', 'rejected')
                          AND EXCLUDED.status::text IN ('open', 'in_progress')
                         THEN r.closed_at ELSE EXCLUDED.closed_at END,
        due_at = EXCLUDED.due_at,
        updated_at = greatest(r.updated_at, EXCLUDED.updated_at);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_total := v_total + v_rows;

  INSERT INTO public.audit_logs
  SELECT * FROM jsonb_populate_recordset(NULL::public.audit_logs, p_ledger -> 'audit_logs')
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_total := v_total + v_rows;

  INSERT INTO public.access_logs
  SELECT * FROM jsonb_populate_recordset(NULL::public.access_logs, p_ledger -> 'access_logs')
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_total := v_total + v_rows;

  ALTER TABLE public.consent_records ENABLE TRIGGER consent_records_guard;
  ALTER TABLE public.policy_acceptances ENABLE TRIGGER policy_acceptances_guard;
  RETURN v_total;
END;
$$;

-- ---------- M1: eliminação de saúde com o ponto do backup ----------
-- O livro é lido com 1 hora de margem antes do ponto (transações em curso no snapshot gravam datas anteriores a
-- ele). Uma eliminação dentro da margem só é refeita se o banco restaurado ainda a tinha pendente (estava em curso
-- no snapshot); a que já tinha terminado antes do backup não apaga dados registrados depois dela.
DROP FUNCTION app.restore_reapply(jsonb);
CREATE FUNCTION app.restore_reapply(p_ledger jsonb, p_since timestamptz)
  RETURNS TABLE (subject uuid, step text)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  r record;
  v_req uuid;
BEGIN
  PERFORM app.restore_assert_ledger(p_ledger, p_since);
  FOR r IN
    SELECT u.id, u.email_verified_at IS NOT NULL AS verified
      FROM public.users u
      LEFT JOIN jsonb_to_recordset(p_ledger -> 'users') AS s(id uuid, deleted_at timestamptz)
        ON s.id = u.id
     WHERE s.id IS NULL OR s.deleted_at IS NOT NULL
     ORDER BY u.id
     FOR UPDATE OF u
  LOOP
    IF NOT r.verified THEN
      DELETE FROM public.users u WHERE u.id = r.id;
      subject := r.id;
      step := 'unverified_removed';
      RETURN NEXT;
      CONTINUE;
    END IF;
    UPDATE public.users u SET deleted_at = coalesce(u.deleted_at, now()), updated_at = now()
     WHERE u.id = r.id;
    UPDATE public.sessions s SET revoked_at = now(), updated_at = now()
     WHERE s.user_id = r.id AND s.revoked_at IS NULL;
    UPDATE public.consent_records c SET revoked_at = now(), updated_at = now()
     WHERE c.user_id = r.id AND c.revoked_at IS NULL;
    SELECT p.id INTO v_req FROM public.privacy_requests p
     WHERE p.user_id = r.id AND p.kind::text IN ('deletion', 'minor_closure')
     ORDER BY p.created_at DESC LIMIT 1;
    IF v_req IS NULL THEN
      INSERT INTO public.privacy_requests (id, user_id, kind, status, due_at, created_at, updated_at)
      VALUES (gen_random_uuid(), r.id, 'deletion', 'in_progress', now(), now(), now());
    ELSE
      UPDATE public.privacy_requests p SET status = 'in_progress', closed_at = NULL, updated_at = now()
       WHERE p.id = v_req;
    END IF;
    subject := r.id;
    step := 'closure';
    RETURN NEXT;
  END LOOP;

  RETURN QUERY
  SELECT DISTINCT a.subject_user_id, 'health_eliminate'::text
    FROM jsonb_to_recordset(p_ledger -> 'audit_logs') AS a(subject_user_id uuid, action text,
                                                           created_at timestamptz)
    JOIN public.users u ON u.id = a.subject_user_id AND u.deleted_at IS NULL
   WHERE a.action = 'health_data_eliminated'
     AND (a.created_at > p_since OR u.health_data_purge_at IS NOT NULL);

  UPDATE public.users u SET health_data_purge_at = s.health_data_purge_at, updated_at = now()
    FROM jsonb_to_recordset(p_ledger -> 'users') AS s(id uuid, health_data_purge_at timestamptz)
   WHERE s.id = u.id AND u.deleted_at IS NULL
     AND u.health_data_purge_at IS DISTINCT FROM s.health_data_purge_at;
END;
$$;

-- O zerar dos acessos também não roda depois de liberado (derrubaria as sessões de quem já entrou de novo).
DROP FUNCTION app.restore_reset_access();
CREATE FUNCTION app.restore_reset_access(p_since timestamptz) RETURNS jsonb
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
  INSERT INTO app.restore_runs (backup_point) VALUES (p_since);
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

REVOKE EXECUTE ON FUNCTION
  app.restore_assert_not_released(timestamptz),
  app.restore_assert_ledger(jsonb, timestamptz),
  app.restore_plan(jsonb, timestamptz),
  app.restore_apply_proofs(jsonb, timestamptz),
  app.restore_reapply(jsonb, timestamptz),
  app.restore_reset_access(timestamptz)
FROM PUBLIC, app_user, app_worker, app_operator, app_backup;
