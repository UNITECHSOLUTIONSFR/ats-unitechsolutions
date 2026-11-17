-- Matching dans les deux sens (17/11/2026) : un profil ajouté ou modifié est comparé tout de suite aux missions ouvertes.

-- Texte d'empreinte d'un seul consultant (même règle que textes_a_empreinter).
create or replace function texte_empreinte_consultant(p_id uuid)
returns table (texte text, empreinte_texte text)
language sql stable security invoker set search_path = public as $$
  with t as (
    select left(concat_ws(E'\n',
      'Poste : ' || nullif(c.intitule_poste, ''),
      'Résumé : ' || nullif(p.resume, ''),
      'Expérience : ' || p.annees_experience || ' ans',
      'Compétences : ' || (select string_agg(k.nom_canonique, ', ' order by cc.annees desc nulls last)
                           from consultant_competences cc join competences k on k.id = cc.competence_id where cc.consultant_id = c.id),
      'CV : ' || nullif(tc.texte, '')), 8000) as texte
    from consultants c
    left join profils p on p.consultant_id = c.id
    left join textes_consultants tc on tc.consultant_id = c.id
    where c.id = p_id
  )
  select texte, md5(texte) from t where length(texte) > 20;
$$;
revoke all on function texte_empreinte_consultant(uuid) from public, anon, authenticated;

-- Missions ouvertes les plus proches d'un consultant par le sens.
create or replace function missions_proches_consultant(p_consultant_id uuid, p_nombre integer)
returns table (mission_id uuid, similarite double precision)
language sql stable security invoker set search_path = public as $$
  select m.mission_id, 1 - (m.empreinte <=> e.empreinte)
  from empreintes_consultants e
  cross join empreintes_missions m
  join missions x on x.id = m.mission_id
  where e.consultant_id = p_consultant_id and x.statut in ('ouverte', 'chez_client')
  order by m.empreinte <=> e.empreinte
  limit least(greatest(p_nombre, 1), 50);
$$;
revoke all on function missions_proches_consultant(uuid, integer) from public, anon, authenticated;
