-- Phase 1 « vitesse » : écran Consultants paginé côté serveur.
-- Projection de lecture : une ligne par ligne affichée (copie de l'Excel + fiches créées hors Excel), préparée à l'avance
-- par le serveur (src/lib/tableau/projection.ts) et mise à jour après chaque modification. Le navigateur ne reçoit plus
-- que la page affichée (50 lignes) ; recherche, filtres et tri sont faits ici, sur toutes les lignes.
create table if not exists tableau_vue (
  id             text primary key,             -- id de la ligne de l'Excel, ou « fiche:<id> » (fiche créée hors Excel)
  position       integer not null,
  consultant_id  uuid references consultants (id) on delete cascade,
  valeurs        jsonb not null default '{}'::jsonb,   -- valeurs telles que saisies (modification d'une cellule)
  affiche        jsonb not null default '{}'::jsonb,   -- valeurs affichées (téléphone 06 12 34 56 78) : filtres
  recherche      text not null default '',             -- texte cherchable, sans accents ni majuscules (colonnes + compétences du CV)
  chiffres       text not null default '',             -- chiffres seuls (numéros de téléphone, quel que soit leur format)
  dispo          text,
  dispo_le       date,
  dispo_maj      timestamptz,
  cree_le        timestamptz,
  source         text,
  cv_analyse     boolean not null default false,
  documents      jsonb not null default '{}'::jsonb,   -- { word, email, pdf } : liens SharePoint
  empreinte      text not null,                         -- contenu de la ligne : seules les lignes changées sont réécrites
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger tableau_vue_maj_updated_at before update on tableau_vue for each row execute function maj_updated_at();
create index if not exists tableau_vue_position on tableau_vue (position);
create index if not exists tableau_vue_consultant on tableau_vue (consultant_id);

alter table tableau_vue enable row level security;
-- Lecture par toute personne active (comme le tableau d'origine) ; écriture réservée au serveur (clé secrète).
create policy tableau_vue_lecture on tableau_vue for select to authenticated using ((select est_utilisateur_actif()));
revoke all on tableau_vue from anon;

-- Tri « naturel » comme Excel : nombres dans l'ordre (2 avant 10), accents et majuscules ignorés.
do $$
begin
  if not exists (select 1 from pg_collation where collname = 'naturel') then
    create collation naturel (provider = icu, locale = 'fr-u-kn-true');
  end if;
end $$;

-- Lignes retenues par les critères de l'écran (recherche, filtres de colonne, filtres rapides, vue).
-- p : { filtres: {colonne: [valeurs]}, mots: [..], chiffres: [..], rapides: [..], vue: "", ids_cv: [uuid], sauf: "colonne" }
create or replace function tableau_lignes_retenues(p jsonb)
returns setof tableau_vue language sql stable security invoker set search_path = public as $$
  with crit as materialized (
    select coalesce(p -> 'filtres', '{}'::jsonb) as filtres,
           array(select jsonb_array_elements_text(coalesce(p -> 'mots', '[]'))) as mots,
           array(select jsonb_array_elements_text(coalesce(p -> 'chiffres', '[]'))) as chiffres,
           array_remove(array(select jsonb_array_elements_text(coalesce(p -> 'rapides', '[]'))) || nullif(coalesce(p ->> 'vue', ''), ''), null) as rapides,
           array(select (jsonb_array_elements_text(coalesce(p -> 'ids_cv', '[]'))))::uuid[] as ids_cv,
           p ->> 'sauf' as sauf,
           (now() at time zone 'Europe/Paris')::date as jour
  )
  select t.* from tableau_vue t, crit c
  where
    -- Filtres de colonne (comme Excel) : la valeur affichée doit être cochée ; « (Vides) » = case vide.
    not exists (
      select 1 from jsonb_each(c.filtres) f
      where f.key is distinct from c.sauf
        and not (coalesce(nullif(t.affiche ->> f.key, ''), '(Vides)') in (select jsonb_array_elements_text(f.value)))
    )
    -- Recherche : chaque mot dans une colonne (ou un numéro, quel que soit son format), ou bien le CV contient les mots.
    and (
      cardinality(c.mots) = 0
      or t.consultant_id = any (c.ids_cv)
      or not exists (
        select 1 from generate_subscripts(c.mots, 1) i
        where strpos(t.recherche, c.mots[i]) = 0
          and (coalesce(c.chiffres[i], '') = '' or strpos(t.chiffres, c.chiffres[i]) = 0)
      )
    )
    -- Filtres rapides et vues du jour.
    and (not ('cv' = any (c.rapides)) or t.cv_analyse)
    and (not ('semaine' = any (c.rapides)) or t.cree_le > now() - interval '7 days')
    and (not ('a_verifier' = any (c.rapides)) or t.dispo_maj is null or t.dispo_maj < now() - interval '90 days')
    and (not ('disponibles' = any (c.rapides)) or t.dispo ~* '(imm[ée]diat|asap|^\s*disponible\s*$)' or t.dispo_le <= c.jour)
    and (not ('email_jour' = any (c.rapides)) or (t.source = 'email' and (t.cree_le at time zone 'Europe/Paris')::date = c.jour))
    and (not ('sharepoint_jour' = any (c.rapides)) or (t.source = 'sharepoint' and (t.cree_le at time zone 'Europe/Paris')::date = c.jour));
$$;

-- Clé de tri d'une valeur : dates JJ/MM/AAAA dans l'ordre chronologique, puis le reste en ordre naturel.
create or replace function tableau_cle_date(v text)
returns text language sql immutable set search_path = public as $$
  select case when v ~ '^\d{2}/\d{2}/\d{4}$' then substr(v, 7, 4) || substr(v, 4, 2) || substr(v, 1, 2) end;
$$;

-- Une page de l'écran Consultants : lignes, nombre total, lignes trouvées seulement grâce au CV, compteurs du jour.
-- p : critères (voir plus haut) + tri: {colonne, sens}, decalage, limite.
create or replace function tableau_page(p jsonb)
returns jsonb language sql stable security invoker set search_path = public as $$
  with r as (select * from tableau_lignes_retenues(p)),
  tri as (select coalesce(p -> 'tri' ->> 'colonne', '') as col, coalesce(p -> 'tri' ->> 'sens', 'asc') as sens),
  page as (
    select r.* from r, tri
    order by
      (nullif(r.valeurs ->> tri.col, '') is null),
      case when tri.sens = 'asc' then tableau_cle_date(r.valeurs ->> tri.col) end asc nulls last,
      case when tri.sens = 'desc' then tableau_cle_date(r.valeurs ->> tri.col) end desc nulls last,
      case when tri.sens = 'asc' then (r.valeurs ->> tri.col) collate naturel end asc,
      case when tri.sens = 'desc' then (r.valeurs ->> tri.col) collate naturel end desc,
      r.position
    offset greatest(coalesce((p ->> 'decalage')::int, 0), 0)
    limit least(greatest(coalesce((p ->> 'limite')::int, 50), 1), 500)
  ),
  mots as (select array(select jsonb_array_elements_text(coalesce(p -> 'mots', '[]'))) as m,
                  array(select jsonb_array_elements_text(coalesce(p -> 'chiffres', '[]'))) as ch)
  select jsonb_build_object(
    'total', (select count(*) from r),
    'lignes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', page.id, 'position', page.position, 'consultant_id', page.consultant_id, 'valeurs', page.valeurs,
        'documents', page.documents,
        -- Trouvée seulement grâce au texte du CV : aucun mot dans les colonnes.
        'par_cv', cardinality(mots.m) > 0 and exists (
          select 1 from generate_subscripts(mots.m, 1) i
          where strpos(page.recherche, mots.m[i]) = 0 and (coalesce(mots.ch[i], '') = '' or strpos(page.chiffres, mots.ch[i]) = 0)),
        'meta', jsonb_build_object('dispo', page.dispo, 'dispoLe', page.dispo_le, 'dispoMaj', page.dispo_maj, 'creeLe', page.cree_le,
                                   'source', page.source, 'cvAnalyse', page.cv_analyse)
      )) from page, mots), '[]'::jsonb),
    'compteurs', jsonb_build_object(
      'email_jour', (select count(*) from tableau_vue t where t.source = 'email' and (t.cree_le at time zone 'Europe/Paris')::date = (now() at time zone 'Europe/Paris')::date),
      'sharepoint_jour', (select count(*) from tableau_vue t where t.source = 'sharepoint' and (t.cree_le at time zone 'Europe/Paris')::date = (now() at time zone 'Europe/Paris')::date),
      'tout', (select count(*) from tableau_vue))
  );
$$;

-- Valeurs d'une colonne avec leur nombre (liste à cocher du filtre) : tiennent compte des autres filtres, comme Excel.
create or replace function tableau_valeurs(p jsonb, p_colonne text)
returns jsonb language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('valeur', v, 'nombre', n) order by v = '(Vides)', tableau_cle_date(v) nulls last, v collate naturel), '[]'::jsonb)
  from (
    select coalesce(nullif(t.affiche ->> p_colonne, ''), '(Vides)') as v, count(*) as n
    from tableau_lignes_retenues(p || jsonb_build_object('sauf', p_colonne)) t
    group by 1
    limit 5000
  ) x;
$$;

-- Identifiants de toutes les lignes retenues, dans l'ordre affiché (export Excel de la vue filtrée).
create or replace function tableau_ids(p jsonb)
returns jsonb language sql stable security invoker set search_path = public as $$
  with tri as (select coalesce(p -> 'tri' ->> 'colonne', '') as col, coalesce(p -> 'tri' ->> 'sens', 'asc') as sens)
  select coalesce(jsonb_agg(r.id order by
      (nullif(r.valeurs ->> tri.col, '') is null),
      case when tri.sens = 'asc' then tableau_cle_date(r.valeurs ->> tri.col) end asc nulls last,
      case when tri.sens = 'desc' then tableau_cle_date(r.valeurs ->> tri.col) end desc nulls last,
      case when tri.sens = 'asc' then (r.valeurs ->> tri.col) collate naturel end asc,
      case when tri.sens = 'desc' then (r.valeurs ->> tri.col) collate naturel end desc,
      r.position), '[]'::jsonb)
  from tableau_lignes_retenues(p) r, tri;
$$;

revoke all on function tableau_lignes_retenues(jsonb) from anon;
revoke all on function tableau_page(jsonb) from anon;
revoke all on function tableau_valeurs(jsonb, text) from anon;
revoke all on function tableau_ids(jsonb) from anon;

-- Recherche dans les CV en deux temps : d'abord les fiches concernées (index plein texte, quelques millisecondes),
-- puis l'extrait surligné seulement pour les lignes affichées (le calcul des extraits était le plus lent).
create or replace function cv_contenant(p_texte text)
returns table (consultant_id uuid)
language sql stable security invoker set search_path = public as $$
  select distinct d.consultant_id
  from documents d
  where d.consultant_id is not null and not d.supprime_sharepoint and length(trim(p_texte)) >= 2
    and to_tsvector('french', coalesce(d.texte_extrait, '')) @@ websearch_to_tsquery('french', p_texte)
  limit 3000;
$$;
create or replace function cv_extraits(p_texte text, p_ids uuid[])
returns table (consultant_id uuid, extrait text, source text)
language sql stable security invoker set search_path = public as $$
  with q as (select websearch_to_tsquery('french', p_texte) as tsq),
  trouves as (
    select distinct on (d.consultant_id)
      d.consultant_id, d.texte_extrait,
      case when d.sharepoint_drive_id like 'boite:%' then 'email' else 'sharepoint' end as source
    from documents d, q
    where d.consultant_id = any (p_ids) and not d.supprime_sharepoint and d.texte_extrait is not null
    -- Le CV qui contient le premier mot d'abord (sans recalculer l'index plein texte, coûteux sur de longs CV).
    order by d.consultant_id, (strpos(lower(d.texte_extrait), lower(split_part(trim(p_texte), ' ', 1))) = 0),
      (d.sharepoint_drive_id like 'boite:%'), d.modifie_sharepoint_le desc nulls last
  )
  -- Extrait calculé sur un passage de 1 500 caractères autour du premier mot cherché (et non sur tout le CV) : bien plus rapide.
  select t.consultant_id,
    regexp_replace(ts_headline('french', substr(t.texte_extrait, greatest(1, coalesce(nullif(strpos(lower(t.texte_extrait), lower(split_part(trim(p_texte), ' ', 1))), 0), 1) - 400), 1500), q.tsq,
      'StartSel=[[, StopSel=]], MaxWords=22, MinWords=10, MaxFragments=2, FragmentDelimiter=" … "'), '\s+', ' ', 'g'),
    t.source
  from trouves t, q;
$$;
revoke all on function cv_contenant(text) from public, anon;
revoke all on function cv_extraits(text, uuid[]) from public, anon;
grant execute on function cv_contenant(text) to authenticated;
grant execute on function cv_extraits(text, uuid[]) to authenticated;
