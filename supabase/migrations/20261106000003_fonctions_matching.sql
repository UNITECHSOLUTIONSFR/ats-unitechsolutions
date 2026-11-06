-- =====================================================================
-- Fonctions de matching (exécutées avec les droits de l'utilisateur : la RLS s'applique)
-- =====================================================================

-- Candidats d'une mission : consultants actifs ayant au moins une compétence demandée,
-- ou un profil sémantiquement proche. Le score lui-même est calculé par l'application.
create or replace function candidats_mission(p_mission_id uuid)
returns table (
  consultant_id         uuid,
  prenom                text,
  nom                   text,
  trigramme             text,
  telephone_e164        text,
  email                 text,
  intitule_poste        text,
  disponibilite         text,
  disponible_le         date,
  disponibilite_maj_le  timestamptz,
  localisation          text,
  annees_experience     numeric,
  seniorite             seniorite,
  competences           jsonb,
  similarite            double precision,
  pdf_anonyme_url       text,
  word_url              text
)
language sql stable security invoker set search_path = public as $$
  with m as (select embedding from missions where id = p_mission_id),
       mc as (select competence_id from mission_competences where mission_id = p_mission_id)
  select
    c.id, c.prenom, c.nom, c.trigramme, c.telephone_e164, c.email, c.intitule_poste,
    c.disponibilite, c.disponible_le, c.disponibilite_maj_le, c.localisation,
    p.annees_experience, p.seniorite,
    coalesce((select jsonb_agg(jsonb_build_object('competence_id', cc.competence_id, 'annees', cc.annees))
              from consultant_competences cc where cc.consultant_id = c.id), '[]'::jsonb),
    case when p.embedding is not null and m.embedding is not null
         then 1 - (p.embedding <=> m.embedding) end,
    (select d.url_web from documents d
      where d.consultant_id = c.id and d.type = 'pdf_anonyme' and not d.supprime_sharepoint
      order by d.modifie_sharepoint_le desc nulls last limit 1),
    (select d.url_web from documents d
      where d.consultant_id = c.id and d.type = 'word_nominatif' and not d.supprime_sharepoint
      order by d.modifie_sharepoint_le desc nulls last limit 1)
  from consultants c
  left join profils p on p.consultant_id = c.id
  cross join m
  where c.statut <> 'inactif'
    and (
      not exists (select 1 from mc)
      or exists (select 1 from consultant_competences cc
                 where cc.consultant_id = c.id and cc.competence_id in (select competence_id from mc))
      or (p.embedding is not null and m.embedding is not null and 1 - (p.embedding <=> m.embedding) > 0.8)
    );
$$;

revoke all on function candidats_mission(uuid) from public, anon;
grant execute on function candidats_mission(uuid) to authenticated;

-- Recherche simple de consultants (nom, trigramme, poste, email, ville, ou texte du CV).
create or replace function rechercher_consultants(p_texte text, p_limite int default 50, p_decalage int default 0)
returns setof consultants
language sql stable security invoker set search_path = public as $$
  select c.* from consultants c
  where coalesce(trim(p_texte), '') = ''
     or c.recherche @@ plainto_tsquery('simple', p_texte)
     or c.trigramme ilike trim(p_texte)
     or c.nom ilike '%' || trim(p_texte) || '%'
     or c.intitule_poste ilike '%' || trim(p_texte) || '%'
     or exists (select 1 from documents d where d.consultant_id = c.id
                and to_tsvector('french', coalesce(d.texte_extrait, '')) @@ plainto_tsquery('french', p_texte))
  order by c.nom, c.prenom
  limit least(p_limite, 200) offset p_decalage;
$$;

revoke all on function rechercher_consultants(text, int, int) from public, anon;
grant execute on function rechercher_consultants(text, int, int) to authenticated;
