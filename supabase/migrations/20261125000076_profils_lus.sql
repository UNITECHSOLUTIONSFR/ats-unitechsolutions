-- Profils d'une mission déjà ouverts (décision de l'utilisatrice du 25/11/2026) : chaque carte indique « Lu » ou
-- « Pas encore lu » pour la personne connectée.
create table if not exists public.profils_lus (
  mission_id uuid not null references public.missions(id) on delete cascade,
  consultant_id uuid not null references public.consultants(id) on delete cascade,
  utilisateur_id uuid not null default auth.uid(),
  lu_le timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (mission_id, consultant_id, utilisateur_id)
);
alter table public.profils_lus enable row level security;
drop policy if exists profils_lus_lecture on public.profils_lus;
create policy profils_lus_lecture on public.profils_lus for select to authenticated using (utilisateur_id = (select auth.uid()) and (select est_utilisateur_actif()));
drop policy if exists profils_lus_ajout on public.profils_lus;
create policy profils_lus_ajout on public.profils_lus for insert to authenticated with check (utilisateur_id = (select auth.uid()) and (select est_utilisateur_actif()));
create index if not exists profils_lus_mission_utilisateur on public.profils_lus (mission_id, utilisateur_id);
alter table public.profils_lus add column if not exists created_at timestamptz not null default now();
alter table public.profils_lus add column if not exists updated_at timestamptz not null default now();
