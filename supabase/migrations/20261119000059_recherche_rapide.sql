-- Audit vitesse du 19/11/2026 : recherche de l'écran Consultants 15-20 s (et parfois coupée à 8 s).
-- Cause : avec les règles d'accès (RLS), Postgres n'a pas le droit d'utiliser l'index plein texte des CV (opérateur non
-- « leakproof ») et relisait les 34 Mo de CV à chaque frappe (8 s mesurées). Ces fonctions de lecture tournent désormais
-- avec les droits du propriétaire, et vérifient elles-mêmes, une seule fois, que la personne est un utilisateur actif :
-- même résultat pour l'équipe (la règle d'accès était déjà « tout utilisateur actif »), index de nouveau utilisé.

create or replace function public.cv_contenant(p_texte text)
 returns table(consultant_id uuid) language sql stable security definer set search_path to 'public' as $function$
  select distinct d.consultant_id
  from documents d
  where (select public.est_utilisateur_actif() or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role') and d.consultant_id is not null and not d.supprime_sharepoint and length(trim(p_texte)) >= 2
    and to_tsvector('french', coalesce(d.texte_extrait, '')) @@ websearch_to_tsquery('french', p_texte)
  limit 3000;
$function$;

CREATE OR REPLACE FUNCTION public.cv_extraits(p_texte text, p_ids uuid[])
 RETURNS TABLE(consultant_id uuid, extrait text, source text)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with q as (select websearch_to_tsquery('french', p_texte) as tsq where (select public.est_utilisateur_actif() or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role')),
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
$function$;

CREATE OR REPLACE FUNCTION public.tableau_lignes_retenues(p jsonb)
 RETURNS SETOF tableau_vue
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
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
    and (not ('sharepoint_jour' = any (c.rapides)) or (t.source = 'sharepoint' and (t.cree_le at time zone 'Europe/Paris')::date = c.jour));
$function$;

revoke execute on function public.cv_contenant(text) from public, anon;
revoke execute on function public.cv_extraits(text, uuid[]) from public, anon;
revoke execute on function public.tableau_lignes_retenues(jsonb) from public, anon;
grant execute on function public.cv_contenant(text) to authenticated, service_role;
grant execute on function public.cv_extraits(text, uuid[]) to authenticated, service_role;
grant execute on function public.tableau_lignes_retenues(jsonb) to authenticated, service_role;
