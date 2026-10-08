-- Tour do painel (ADR-0025): se a pessoa concluiu ou pulou o tour. Booleano, sem data (minimização: a data
-- revelaria quando a pessoa usou o app). Preferência de interface, não é dado de saúde. O runtime só pode
-- alterar esta coluna nova (concessão por coluna, ADR-0017).
ALTER TABLE "users" ADD COLUMN "tour_seen" BOOLEAN NOT NULL DEFAULT false;

GRANT UPDATE (tour_seen) ON public.users TO app_user;
