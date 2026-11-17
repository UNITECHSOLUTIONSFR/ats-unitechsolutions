-- Travaux longs faits en arrière-plan (17/11/2026) : l'écran répond tout de suite, la fiche se complète ensuite.
-- CV joint en cours de lecture par l'IA (création de fiche, ajout de CV) : date de début, et message une fois fini.
alter table public.consultants add column if not exists cv_en_lecture timestamptz;
alter table public.consultants add column if not exists cv_lecture_message text;
-- CV Unitech (Word) préparé en arrière-plan : date de début, et message d'erreur éventuel.
alter table public.consultants add column if not exists cv_unitech_en_cours timestamptz;
alter table public.consultants add column if not exists cv_unitech_message text;

-- Recherche en phrase libre : la lecture de la phrase par l'IA est gardée 30 jours ; la même phrase revient instantanément.
create table if not exists public.cache_recherches (
  cle text primary key,
  criteres jsonb not null,
  reponse text,
  created_at timestamptz not null default now()
);
alter table public.cache_recherches enable row level security; -- aucune règle : lisible par le serveur seulement
