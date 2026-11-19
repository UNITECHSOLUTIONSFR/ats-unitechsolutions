-- Audit vitesse du 19/11/2026 : tri de l'écran Consultants sur des lignes étroites (identifiant + valeur triée), puis
-- relecture des seules 50 lignes affichées ; mémoire de tri portée à 16 Mo pour cette fonction. Résultat identique.
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
                                   'source', page.source, 'cvAnalyse', page.cv_analyse)
      ) order by page.rang) from page, mots), '[]'::jsonb),
    'compteurs', jsonb_build_object(
      'email_jour', (select count(*) from tableau_vue t where t.source = 'email' and (t.cree_le at time zone 'Europe/Paris')::date = (now() at time zone 'Europe/Paris')::date),
      'sharepoint_jour', (select count(*) from tableau_vue t where t.source = 'sharepoint' and (t.cree_le at time zone 'Europe/Paris')::date = (now() at time zone 'Europe/Paris')::date),
      'tout', (select count(*) from tableau_vue))
  );
$function$

;
drop function if exists public.tableau_page_v2(jsonb);
