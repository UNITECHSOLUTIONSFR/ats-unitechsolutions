-- Statuts de la fiche (26/11/2026, accord de l'utilisatrice) : consultant Unitech en mission, en mission ailleurs,
-- ne pas contacter (avec motif) ; visibles sur la fiche, dans la liste Consultants (filtres) et sur les missions
-- (« ne pas contacter » n'est plus proposé). Rien n'est écrit dans l'Excel d'origine pour ces statuts.
alter type public.statut_consultant add value if not exists 'en_mission_unitech';
alter type public.statut_consultant add value if not exists 'en_mission_ailleurs';
alter type public.statut_consultant add value if not exists 'ne_pas_contacter';
alter table public.consultants add column if not exists statut_motif text;
alter table public.consultants add column if not exists mission_client text;
alter table public.consultants add column if not exists mission_fin date;
alter table public.tableau_vue add column if not exists statut text;

CREATE OR REPLACE FUNCTION public.tableau_lignes_retenues(p jsonb)
 RETURNS SETOF tableau_vue
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  where (select public.est_utilisateur_actif() or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role') and
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
    and (not ('sharepoint_jour' = any (c.rapides)) or (t.source = 'sharepoint' and (t.cree_le at time zone 'Europe/Paris')::date = c.jour))
    -- Statuts de la fiche (26/11/2026) : consultants Unitech en mission, en mission ailleurs, à ne pas contacter.
    and (not ('unitech' = any (c.rapides)) or t.statut = 'en_mission_unitech')
    and (not ('ailleurs' = any (c.rapides)) or t.statut = 'en_mission_ailleurs')
    and (not ('ne_pas_contacter' = any (c.rapides)) or t.statut = 'ne_pas_contacter');
$function$;

CREATE OR REPLACE FUNCTION public.tableau_page(p jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
 SET work_mem TO '16MB'
AS $function$
  -- Audit du 19/11/2026 : le tri ne porte plus que sur l'identifiant et la valeur de la colonne triée (lignes étroites,
  -- sans passer par le disque) ; les 50 lignes affichées sont relues ensuite en entier.
  with tri as (select coalesce(p -> 'tri' ->> 'colonne', '') as col, coalesce(p -> 'tri' ->> 'sens', 'asc') as sens),
  r as (select x.id, x.position, x.valeurs ->> tri.col as v from tableau_lignes_retenues(p) x, tri),
  ordre as (
    select r.id, row_number() over (order by
      (nullif(r.v, '') is null),
      case when tri.sens = 'asc' then tableau_cle_date(r.v) end asc nulls last,
      case when tri.sens = 'desc' then tableau_cle_date(r.v) end desc nulls last,
      case when tri.sens = 'asc' then r.v collate naturel end asc,
      case when tri.sens = 'desc' then r.v collate naturel end desc,
      r.position) as rang
    from r, tri
    order by rang
    offset greatest(coalesce((p ->> 'decalage')::int, 0), 0)
    limit least(greatest(coalesce((p ->> 'limite')::int, 50), 1), 500)
  ),
  page as (select t.*, o.rang from ordre o join tableau_vue t on t.id = o.id),
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
                                   'source', page.source, 'cvAnalyse', page.cv_analyse, 'statut', page.statut)
      ) order by page.rang) from page, mots), '[]'::jsonb),
    'compteurs', jsonb_build_object(
      'email_jour', (select count(*) from tableau_vue t where t.source = 'email' and (t.cree_le at time zone 'Europe/Paris')::date = (now() at time zone 'Europe/Paris')::date),
      'sharepoint_jour', (select count(*) from tableau_vue t where t.source = 'sharepoint' and (t.cree_le at time zone 'Europe/Paris')::date = (now() at time zone 'Europe/Paris')::date),
      'tout', (select count(*) from tableau_vue))
  );
$function$;
