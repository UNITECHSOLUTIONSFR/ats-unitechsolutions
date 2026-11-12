-- Avis de l'IA sur l'adéquation d'un consultant à une mission (demandé d'un clic) : gardé pour ne pas être payé deux fois.
create table if not exists avis_ia (
  id             uuid primary key default gen_random_uuid(),
  mission_id     uuid not null references missions (id) on delete cascade,
  consultant_id  uuid not null references consultants (id) on delete cascade,
  contenu        jsonb not null,
  cout_usd       numeric(10,5) not null default 0,
  par            uuid references utilisateurs (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (mission_id, consultant_id)
);
alter table avis_ia enable row level security;
create policy avis_ia_lecture on avis_ia for select to authenticated using (est_utilisateur_actif());
create policy avis_ia_ajout on avis_ia for insert to authenticated with check (est_utilisateur_actif());
create policy avis_ia_retrait on avis_ia for delete to authenticated using (est_admin());
grant select, insert, delete on avis_ia to authenticated;
create trigger avis_ia_maj before update on avis_ia for each row execute function maj_updated_at();
