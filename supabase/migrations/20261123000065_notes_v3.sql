-- Matching v3 (23/11/2026) : notes de l'IA par mission et par profil, en deux temps (résumé du parcours, puis CV complet
-- des profils retenus). Une note est gardée tant que ni la mission ni le CV ne changent (empreinte) : jamais repayée.
create table if not exists public.notes_v3 (
  mission_id uuid not null references public.missions(id) on delete cascade,
  consultant_id uuid not null references public.consultants(id) on delete cascade,
  etape text not null check (etape in ('resume', 'complet')),
  empreinte text not null,
  note int not null,
  bon boolean not null,
  raison text,
  detail jsonb,
  modele text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (mission_id, consultant_id, etape)
);
alter table public.notes_v3 enable row level security;
drop policy if exists notes_v3_lecture on public.notes_v3;
create policy notes_v3_lecture on public.notes_v3 for select to authenticated using ((select est_utilisateur_actif()));
