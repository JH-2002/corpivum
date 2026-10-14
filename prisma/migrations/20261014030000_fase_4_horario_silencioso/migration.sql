-- Revisão da Fase 4: a CHECK do horário silencioso aceitava só um dos horários (NULL em BETWEEN vira NULL,
-- e CHECK com NULL passa). Agora os dois horários são exigidos juntos, explicitamente. Um par incompleto
-- gravado antes desta correção é desfeito (sem horário silencioso), para a CHECK nova valer.
UPDATE public.users SET quiet_start_min = NULL, quiet_end_min = NULL
 WHERE (quiet_start_min IS NULL) <> (quiet_end_min IS NULL);
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_quiet_hours;
ALTER TABLE public.users
  ADD CONSTRAINT users_quiet_hours CHECK (
    (quiet_start_min IS NULL AND quiet_end_min IS NULL) OR
    (quiet_start_min IS NOT NULL AND quiet_end_min IS NOT NULL AND
     quiet_start_min BETWEEN 0 AND 1439 AND quiet_end_min BETWEEN 0 AND 1439 AND
     quiet_start_min <> quiet_end_min));
