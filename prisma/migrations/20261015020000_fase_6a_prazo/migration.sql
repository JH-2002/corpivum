-- Revisão da Fase 6a (ADR-0032): `expires_at` é timestamptz(3); o arredondamento para milissegundos pode deixar
-- `now() + 24 h` um pouco acima do teto exato. Tolerância de 1 s, só para isso.
CREATE OR REPLACE FUNCTION app.data_export_jobs_guard() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW.expires_at IS NOT NULL AND NEW.expires_at > now() + interval '24 hours 1 second' THEN
    RAISE EXCEPTION 'export link longer than 24 hours' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.expires_at IS NOT NULL AND (NEW.expires_at IS NULL OR NEW.expires_at > OLD.expires_at) THEN
      RAISE EXCEPTION 'export link cannot be extended' USING ERRCODE = '23514';
    END IF;
    IF OLD.file_deleted_at IS NOT NULL AND
       (NEW.file_deleted_at IS DISTINCT FROM OLD.file_deleted_at OR NEW.status <> 'expired') THEN
      RAISE EXCEPTION 'export file already deleted' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Função de trigger: ninguém a chama diretamente (o banco a executa no gatilho).
REVOKE EXECUTE ON FUNCTION app.data_export_jobs_guard() FROM PUBLIC;
-- Padrão do schema `app`: só app_user executa (chamar fora de um gatilho falha de qualquer forma).
GRANT EXECUTE ON FUNCTION app.data_export_jobs_guard() TO app_user;
