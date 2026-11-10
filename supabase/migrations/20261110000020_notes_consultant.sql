-- Notes rapides sur une fiche : journal d'échanges daté, partagé par l'équipe (« appelé, dispo mars »).
create table if not exists notes_consultant (
  id             uuid primary key default gen_random_uuid(),
  consultant_id  uuid not null references consultants (id) on delete cascade,
  auteur         uuid references utilisateurs (id) on delete set null default auth.uid(),
  texte          text not null check (length(trim(texte)) between 1 and 2000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists notes_consultant_idx on notes_consultant (consultant_id, created_at desc);
alter table notes_consultant enable row level security;
create policy notes_lecture on notes_consultant for select to authenticated using (est_utilisateur_actif());
create policy notes_ajout on notes_consultant for insert to authenticated with check (est_utilisateur_actif() and auteur = auth.uid());
-- Chacun peut retirer ses propres notes ; un administrateur peut retirer toutes les notes.
create policy notes_retrait on notes_consultant for delete to authenticated using (auteur = auth.uid() or est_admin());
grant select, insert, delete on notes_consultant to authenticated;
create trigger notes_consultant_maj before update on notes_consultant for each row execute function maj_updated_at();
