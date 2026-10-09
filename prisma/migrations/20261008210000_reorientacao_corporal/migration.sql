-- Reorientação para o desenvolvimento corporal (ADR-0027): humor e diário saíram do produto. Remove as
-- tabelas, as políticas RLS (caem junto com as tabelas), as restrições, os índices e os tipos ligados a elas.
-- Só existem dados locais de desenvolvimento (CLAUDE.md regra 6): não há eliminação de dado real.
DROP TABLE public.mood_entries;
DROP TABLE public.journal_entries;

DROP TYPE public.mood_emotion;
DROP TYPE public.journal_tag;
