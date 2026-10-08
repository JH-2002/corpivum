-- Tour do painel (ADR-0025): quando a pessoa concluiu ou pulou o tour. Preferência de interface, não é
-- dado de saúde. O runtime só pode alterar esta coluna nova (concessão por coluna, ADR-0017).
ALTER TABLE "users" ADD COLUMN "tour_seen_at" TIMESTAMPTZ(3);

GRANT UPDATE (tour_seen_at) ON public.users TO app_user;
