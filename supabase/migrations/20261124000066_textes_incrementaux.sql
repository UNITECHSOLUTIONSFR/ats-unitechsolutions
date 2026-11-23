-- Point 1 de l'audit du 23/11/2026 : le texte complet de chaque consultant (CV + ligne Excel + poste + notes) n'est plus
-- recalculé pour les 5 000 consultants toutes les 3 heures (vue matérialisée). Il devient une table tenue à jour
-- consultant par consultant : une modification (document, ligne du tableau, fiche) met le consultant dans une file
-- d'attente, traitée toutes les 10 minutes ; une file vide ne coûte rien.

-- Texte complet d'UN consultant (même contenu que l'ancienne vue).
create or replace function public.texte_complet_consultant(p uuid)
returns text
language sql
stable
set search_path = public
as $$
  select lower(string_agg(t, ' ')) from (
    select d.texte_extrait t from documents d
      where d.consultant_id = p and not d.supprime_sharepoint and d.texte_extrait is not null
    union all
    select (select string_agg(e.v, ' ') from jsonb_each_text(l.valeurs) e(k, v)) from tableau_lignes l where l.consultant_id = p
    union all
    select concat_ws(' ', c.intitule_poste, c.notes) from consultants c where c.id = p
  ) x where t is not null;
$$;

-- La vue matérialisée devient une table (même nom, mêmes colonnes, mêmes index) : le code et les fonctions qui la lisent ne changent pas.
do $$
begin
  if exists (select 1 from pg_matviews where schemaname = 'public' and matviewname = 'textes_consultants') then
    create table public.textes_consultants_t as select consultant_id, texte from public.textes_consultants;
    drop materialized view public.textes_consultants;
    alter table public.textes_consultants_t rename to textes_consultants;
  end if;
end $$;
alter table public.textes_consultants alter column consultant_id set not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'textes_consultants_pkey') then
    alter table public.textes_consultants add constraint textes_consultants_pkey primary key (consultant_id);
  end if;
end $$;
create index if not exists textes_consultants_trgm on public.textes_consultants using gin (texte gin_trgm_ops);
alter table public.textes_consultants add column if not exists created_at timestamptz not null default now();
alter table public.textes_consultants add column if not exists updated_at timestamptz not null default now();
alter table public.textes_consultants enable row level security;
drop policy if exists textes_consultants_lecture on public.textes_consultants;
create policy textes_consultants_lecture on public.textes_consultants for select to authenticated using ((select est_utilisateur_actif()));

-- File d'attente des consultants dont le texte est à refaire.
create table if not exists public.textes_a_refaire (
  consultant_id uuid primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.textes_a_refaire enable row level security;

create or replace function public.signaler_texte_a_refaire()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'consultants' then
    if tg_op = 'DELETE' then return old; end if;
    insert into textes_a_refaire (consultant_id) values (new.id) on conflict do nothing;
    return new;
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.consultant_id is not null then
    insert into textes_a_refaire (consultant_id) values (old.consultant_id) on conflict do nothing;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.consultant_id is not null then
    insert into textes_a_refaire (consultant_id) values (new.consultant_id) on conflict do nothing;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists textes_documents on public.documents;
create trigger textes_documents after insert or delete or update of texte_extrait, consultant_id, supprime_sharepoint on public.documents
  for each row execute function public.signaler_texte_a_refaire();
drop trigger if exists textes_tableau on public.tableau_lignes;
create trigger textes_tableau after insert or delete or update of valeurs, consultant_id on public.tableau_lignes
  for each row execute function public.signaler_texte_a_refaire();
drop trigger if exists textes_fiches on public.consultants;
create trigger textes_fiches after insert or update of intitule_poste, notes on public.consultants
  for each row execute function public.signaler_texte_a_refaire();

-- Traitement de la file (appelé toutes les 10 minutes) : instantané quand elle est vide.
create or replace function public.traiter_textes_a_refaire(p_limite int default 500)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int := 0; r record; t text;
begin
  for r in select consultant_id from textes_a_refaire order by created_at limit p_limite loop
    t := texte_complet_consultant(r.consultant_id);
    if t is null or not exists (select 1 from consultants where id = r.consultant_id) then
      delete from textes_consultants where consultant_id = r.consultant_id;
    else
      insert into textes_consultants (consultant_id, texte, updated_at) values (r.consultant_id, t, now())
      on conflict (consultant_id) do update set texte = excluded.texte, updated_at = now()
      where textes_consultants.texte is distinct from excluded.texte;
    end if;
    delete from textes_a_refaire where consultant_id = r.consultant_id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.traiter_textes_a_refaire(int) from public, anon, authenticated;

-- Planification : l'ancien recalcul global toutes les 3 heures est remplacé par le traitement de la file.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'ats-textes';
    perform cron.schedule('ats-textes', '*/10 * * * *', 'select public.traiter_textes_a_refaire(500)');
  end if;
end $$;
