-- Tableau de suivi : copie fidèle du fichier Excel (mêmes onglets, mêmes en-têtes, même ordre).
-- Chaque ligne de l'onglet principal est reliée à la fiche consultant correspondante.

create table tableau_onglets (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null,
  position    int  not null,
  entetes     text[] not null default '{}',   -- en-têtes dans l'ordre de l'Excel
  principal   boolean not null default false, -- onglet qui alimente les fiches consultants
  fichier     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table tableau_lignes (
  id             uuid primary key default gen_random_uuid(),
  onglet_id      uuid not null references tableau_onglets (id) on delete cascade,
  position       int  not null,                 -- numéro de ligne dans l'Excel
  valeurs        jsonb not null default '{}',   -- { en-tête: valeur affichée }
  -- Effacement RGPD d'un consultant = sa ligne disparaît aussi du tableau.
  consultant_id  uuid references consultants (id) on delete cascade,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index tableau_lignes_onglet_idx on tableau_lignes (onglet_id, position);
create index tableau_lignes_consultant_idx on tableau_lignes (consultant_id);

create trigger tableau_onglets_maj before update on tableau_onglets for each row execute function maj_updated_at();
create trigger tableau_lignes_maj before update on tableau_lignes for each row execute function maj_updated_at();

alter table tableau_onglets enable row level security;
alter table tableau_lignes enable row level security;
revoke all on tableau_onglets, tableau_lignes from anon;
grant select, insert, update, delete on tableau_onglets, tableau_lignes to authenticated;

-- Onglets : lecture pour tout utilisateur actif ; structure gérée par les administrateurs (import).
create policy tableau_onglets_lecture on tableau_onglets for select to authenticated using (est_utilisateur_actif());
create policy tableau_onglets_creation on tableau_onglets for insert to authenticated with check (est_admin());
create policy tableau_onglets_modification on tableau_onglets for update to authenticated using (est_admin()) with check (est_admin());
create policy tableau_onglets_suppression on tableau_onglets for delete to authenticated using (est_admin());

-- Lignes : lecture et modification pour tout utilisateur actif ; ajout/suppression par les administrateurs.
create policy tableau_lignes_lecture on tableau_lignes for select to authenticated using (est_utilisateur_actif());
create policy tableau_lignes_creation on tableau_lignes for insert to authenticated with check (est_admin());
create policy tableau_lignes_modification on tableau_lignes for update to authenticated using (est_utilisateur_actif()) with check (est_utilisateur_actif());
create policy tableau_lignes_suppression on tableau_lignes for delete to authenticated using (est_admin());

-- Modification d'une colonne sur une ou plusieurs lignes en une seule requête (RLS appliquée : security invoker).
-- Valeur vide = cellule vidée.
create or replace function tableau_modifier(p_ids uuid[], p_colonne text, p_valeur text)
returns int language sql security invoker set search_path = public as $$
  with maj as (
    update tableau_lignes
       set valeurs = case when coalesce(btrim(p_valeur), '') = '' then valeurs - p_colonne
                          else jsonb_set(valeurs, array[p_colonne], to_jsonb(btrim(p_valeur))) end
     where id = any(p_ids)
       and onglet_id = (select onglet_id from tableau_lignes where id = p_ids[1])
    returning 1
  )
  select count(*)::int from maj;
$$;
revoke all on function tableau_modifier(uuid[], text, text) from public, anon;
grant execute on function tableau_modifier(uuid[], text, text) to authenticated;
