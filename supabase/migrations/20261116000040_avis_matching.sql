-- Matching avec IA : avis de l'IA sur chaque profil présélectionné pour une mission (pertinent / à étudier / hors sujet).
-- Gardé tant que la mission ne change pas (empreinte) : un profil n'est jugé qu'une fois par version de mission.
create table if not exists avis_matching (
  mission_id     uuid not null references missions (id) on delete cascade,
  consultant_id  uuid not null references consultants (id) on delete cascade,
  empreinte      text not null,
  verdict        text not null check (verdict in ('pertinent', 'a_etudier', 'hors_sujet')),
  raison         text,
  modele         text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (mission_id, consultant_id)
);
alter table avis_matching enable row level security;
-- Lecture par toute personne active ; écriture réservée au serveur (clé secrète).
create policy avis_matching_lecture on avis_matching for select to authenticated using ((select est_utilisateur_actif()));
revoke all on avis_matching from anon;
