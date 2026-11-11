-- Recherche dans le texte des CV avec l'extrait où le mot apparaît et l'origine du CV.
-- Un seul CV par personne : le CV SharePoint en priorité (celui que l'équipe ouvre), sinon le CV reçu par email.
create or replace function rechercher_dans_cv_extraits(p_texte text)
returns table (consultant_id uuid, extrait text, source text)
language sql stable security invoker set search_path = public as $$
  with q as (select websearch_to_tsquery('french', p_texte) as tsq),
  trouves as (
    select distinct on (d.consultant_id)
      d.consultant_id, d.texte_extrait,
      case when d.sharepoint_drive_id like 'boite:%' then 'email' else 'sharepoint' end as source
    from documents d, q
    where d.consultant_id is not null and not d.supprime_sharepoint
      and length(trim(p_texte)) >= 2
      and to_tsvector('french', coalesce(d.texte_extrait, '')) @@ q.tsq
    order by d.consultant_id, (d.sharepoint_drive_id like 'boite:%'), d.modifie_sharepoint_le desc nulls last
    limit 3000
  )
  select t.consultant_id,
    regexp_replace(ts_headline('french', t.texte_extrait, q.tsq,
      'StartSel=[[, StopSel=]], MaxWords=22, MinWords=10, MaxFragments=2, FragmentDelimiter=" … "'), '\s+', ' ', 'g'),
    t.source
  from trouves t, q;
$$;
revoke all on function rechercher_dans_cv_extraits(text) from public, anon;
grant execute on function rechercher_dans_cv_extraits(text) to authenticated;
