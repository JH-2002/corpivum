-- =====================================================================================================
-- Escrito à mão (ADR-0035; LEG-R01, R03, S07). Retenção da Fase 6c.
-- Mesmas regras da ADR-0015: SECURITY DEFINER com search_path fixo, objetos qualificados, sem SQL dinâmico,
-- retorno mínimo (só a contagem).
-- =====================================================================================================

-- ---------- Provas de reautenticação vencidas ou usadas (PR1b-R2-B1) ----------
-- A prova vale 2 minutos e é de uso único. Até aqui, uma prova emitida e não consumida (ex.: teto de
-- encerramentos atingido) ficava na tabela até a próxima emissão da mesma pessoa ou o fim da conta, ligando
-- a conta ao propósito (`minor_closure`, `account_deletion`). O job diário `privacy.reauth_proofs_purge`
-- apaga, de todas as contas, as vencidas e as já usadas. Uma prova válida e não usada nunca sai: a folga de
-- 1 minuto depois do vencimento evita disputa com quem está consumindo a prova naquele instante.
CREATE FUNCTION app.privacy_purge_reauth_proofs() RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_n integer;
BEGIN
  DELETE FROM public.reauth_proofs r
   WHERE r.used_at IS NOT NULL
      OR r.expires_at < now() - interval '1 minute';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE EXECUTE ON FUNCTION app.privacy_purge_reauth_proofs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.privacy_purge_reauth_proofs() TO app_user;
