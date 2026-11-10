-- CV Unitech générés : gardés dans l'outil pour être rouverts sans nouvelle génération (les fichiers sont dans SharePoint).
create table if not exists cv_unitech_generes (
  id             uuid primary key default gen_random_uuid(),
  consultant_id  uuid not null references consultants (id) on delete cascade,
  mission_id     uuid references missions (id) on delete set null,
  word_nom       text not null,
  word_url       text not null,
  pdf_nom        text not null,
  pdf_url        text not null,
  dossier        text not null,
  cout_usd       numeric(10,4) not null default 0,
  par            uuid references utilisateurs (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists cv_unitech_generes_consultant_idx on cv_unitech_generes (consultant_id, created_at desc);
alter table cv_unitech_generes enable row level security;
create policy cv_unitech_lecture on cv_unitech_generes for select to authenticated using (est_utilisateur_actif());
create policy cv_unitech_ajout on cv_unitech_generes for insert to authenticated with check (est_utilisateur_actif());
create policy cv_unitech_retrait on cv_unitech_generes for delete to authenticated using (est_admin());
grant select, insert, delete on cv_unitech_generes to authenticated;
create trigger cv_unitech_generes_maj before update on cv_unitech_generes for each row execute function maj_updated_at();
