-- =================================================================================================
-- Fase 7e (ADR-0040): operação. Escrito à mão.
-- OI-35: arquivos de exportação órfãos no storage (varredura do `reports.expire`, só no app_worker).
-- P7-M3: reaplicação, no banco RESTAURADO, das exclusões, encerramentos, expurgos, revogações e eliminações
-- feitos depois do backup (`pnpm backup:restore`). Funções só do dono (app_migrator): nenhum papel da
-- aplicação as executa (conferido em `pnpm db:verify-roles`).
-- =================================================================================================

-- Registro da reaplicação no AuditLog (sem pessoa; o papel de quem rodou fica em `operator_role`).
ALTER TYPE "audit_action" ADD VALUE 'restore_reapplied';

-- ---------- OI-35: arquivo no storage sem pedido que o reconheça ----------
-- Recebe as chaves `exports/<pessoa>/<pedido>.bin` listadas no storage, já decompostas, e devolve as que
-- nenhum pedido com arquivo vivo reconhece: conta purgada (a geração terminou depois da purga), pedido apagado
-- ou arquivo já dado como apagado. O pedido nasce antes do arquivo, então um arquivo em geração nunca é órfão.
CREATE FUNCTION app.exports_orphans(p_user_ids uuid[], p_job_ids uuid[])
  RETURNS TABLE (user_id uuid, job_id uuid)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF p_user_ids IS NULL OR p_job_ids IS NULL
     OR cardinality(p_user_ids) <> cardinality(p_job_ids) OR cardinality(p_user_ids) > 1000 THEN
    RAISE EXCEPTION 'invalid keys' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT k.u, k.j FROM unnest(p_user_ids, p_job_ids) AS k(u, j)
   WHERE NOT EXISTS (SELECT 1 FROM public.data_export_jobs e
                      WHERE e.id = k.j AND e.user_id = k.u AND e.file_deleted_at IS NULL);
END;
$$;

REVOKE EXECUTE ON FUNCTION app.exports_orphans(uuid[], uuid[]) FROM PUBLIC, app_user;
GRANT EXECUTE ON FUNCTION app.exports_orphans(uuid[], uuid[]) TO app_worker;

-- ---------- P7-M3 (1): livro do que mudou depois do backup, lido no banco de ORIGEM ----------
-- Uma leitura só (um snapshot): ids e estado das contas (sem e-mail), e as provas criadas ou alteradas depois
-- de `p_since` (consentimentos, aceites, pedidos, AuditLog, registros de acesso). Nenhum dado de saúde, nenhum
-- e-mail, nenhum texto livre (as provas não têm). Usado também por `pnpm backup:ledger` (cópia fora do banco).
CREATE FUNCTION app.restore_ledger(p_since timestamptz) RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
  SELECT jsonb_build_object(
    'version', 1,
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

-- ---------- P7-M3 (2): provas da origem copiadas para o banco restaurado ----------
-- A origem prevalece: revogações, pedidos fechados e AuditLog posteriores ao backup voltam com as datas
-- originais (LEG-R03). Os gatilhos que reescrevem as datas e conferem a versão vigente do texto ficam
-- desligados SÓ dentro desta transação (o banco restaurado ainda não tem acesso; ALTER TABLE trava a tabela).
-- Idempotente: roda antes e depois da purga das contas encerradas.
CREATE FUNCTION app.restore_apply_proofs(p_ledger jsonb) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_total integer := 0;
  v_rows integer;
BEGIN
  IF p_ledger ->> 'version' IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'invalid ledger' USING ERRCODE = '22023';
  END IF;
  ALTER TABLE public.consent_records DISABLE TRIGGER consent_records_guard;
  ALTER TABLE public.policy_acceptances DISABLE TRIGGER policy_acceptances_guard;

  INSERT INTO public.consent_records
  SELECT * FROM jsonb_populate_recordset(NULL::public.consent_records, p_ledger -> 'consent_records')
  ON CONFLICT (id) DO UPDATE SET revoked_at = EXCLUDED.revoked_at, updated_at = EXCLUDED.updated_at;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_total := v_total + v_rows;

  INSERT INTO public.policy_acceptances
  SELECT * FROM jsonb_populate_recordset(NULL::public.policy_acceptances, p_ledger -> 'policy_acceptances')
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_total := v_total + v_rows;

  INSERT INTO public.privacy_requests
  SELECT * FROM jsonb_populate_recordset(NULL::public.privacy_requests, p_ledger -> 'privacy_requests')
  ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, closed_at = EXCLUDED.closed_at,
                                 due_at = EXCLUDED.due_at, updated_at = EXCLUDED.updated_at;
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

-- ---------- P7-M3 (3): contas encerradas e carência de saúde ----------
-- Conta do banco restaurado que não existe mais na origem (purgada, encerrada como menor, expirada sem
-- onboarding, não verificada expurgada) ou que lá está excluída:
--   - nunca verificada: sai na hora, como no `auth.purge_expired` (não tem dado de saúde nem prova);
--   - verificada: acesso cortado e o pedido de encerramento mais recente volta a "em andamento", para a purga
--     normal (`app.account_purge`, com os eliminadores) rodar em seguida; a cópia das provas, refeita depois
--     da purga, devolve ao pedido a situação e a data da origem. Sem pedido (não deveria acontecer), abre um
--     pedido `deletion` só para a purga.
-- Devolve também as contas cujos dados de saúde foram eliminados na origem depois do backup, e acerta o
-- agendamento da eliminação pela origem (revogação nova agenda; reconsentir cancela).
CREATE FUNCTION app.restore_reapply(p_ledger jsonb)
  RETURNS TABLE (subject uuid, step text)
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  r record;
  v_req uuid;
BEGIN
  IF p_ledger ->> 'version' IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'invalid ledger' USING ERRCODE = '22023';
  END IF;
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
    FROM jsonb_to_recordset(p_ledger -> 'audit_logs') AS a(subject_user_id uuid, action text)
    JOIN public.users u ON u.id = a.subject_user_id AND u.deleted_at IS NULL
   WHERE a.action = 'health_data_eliminated';

  UPDATE public.users u SET health_data_purge_at = s.health_data_purge_at, updated_at = now()
    FROM jsonb_to_recordset(p_ledger -> 'users') AS s(id uuid, health_data_purge_at timestamptz)
   WHERE s.id = u.id AND u.deleted_at IS NULL
     AND u.health_data_purge_at IS DISTINCT FROM s.health_data_purge_at;
END;
$$;

-- ---------- P7-M3 (4): acesso zerado no banco restaurado (com ou sem origem) ----------
-- Sessões revogadas depois do backup voltariam válidas, e tokens e provas já usados voltariam a valer: tudo
-- sai e todos entram de novo. Links de exportação vencem (o `reports.expire` apaga os arquivos). Roda o
-- expurgo de autenticação (contas não verificadas há mais de 7 dias, tokens vencidos) e grava o AuditLog
-- `restore_reapplied` com o papel de quem rodou.
CREATE FUNCTION app.restore_reset_access() RETURNS jsonb
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
  app.restore_ledger(timestamptz),
  app.restore_apply_proofs(jsonb),
  app.restore_reapply(jsonb),
  app.restore_reset_access()
FROM PUBLIC, app_user, app_worker, app_operator;
