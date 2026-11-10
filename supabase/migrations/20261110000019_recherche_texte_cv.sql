-- Recherche d'un mot dans le texte des CV (index plein texte existant, en français). Règles d'accès appliquées.
create or replace function rechercher_dans_cv(p_texte text)
returns table (consultant_id uuid)
language sql stable security invoker set search_path = public as $$
  select distinct d.consultant_id
  from documents d
  where d.consultant_id is not null and not d.supprime_sharepoint
    and length(trim(p_texte)) >= 2
    and to_tsvector('french', coalesce(d.texte_extrait, '')) @@ websearch_to_tsquery('french', p_texte)
  limit 3000;
$$;
revoke all on function rechercher_dans_cv(text) from public, anon;
grant execute on function rechercher_dans_cv(text) to authenticated;
