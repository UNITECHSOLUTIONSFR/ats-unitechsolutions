-- Section « Recherche » : candidats pour une recherche libre (sans mission enregistrée).
-- Retenus : au moins une compétence demandée, ou un intitulé de poste qui correspond, ou trouvés dans le texte du CV.
create or replace function candidats_recherche(p_competences uuid[], p_motifs_poste text[], p_ids uuid[])
returns table (
  consultant_id         uuid,
  prenom                text,
  nom                   text,
  trigramme             text,
  telephone_e164        text,
  email                 text,
  intitule_poste        text,
  statut                text,
  disponibilite         text,
  disponible_le         date,
  disponibilite_maj_le  timestamptz,
  localisation          text,
  mobilite              text,
  annees_experience     numeric,
  seniorite             seniorite,
  resume                text,
  competences           jsonb,
  pdf_anonyme_url       text,
  word_url              text
)
language sql stable security invoker set search_path = public as $$
  with retenus as (
    select cc.consultant_id as id from consultant_competences cc where cc.competence_id = any(coalesce(p_competences, '{}'))
    union
    select c.id from consultants c where c.intitule_poste ilike any(coalesce(p_motifs_poste, '{}'))
    union
    select unnest(coalesce(p_ids, '{}'))
  )
  select
    c.id, c.prenom, c.nom, c.trigramme, c.telephone_e164, c.email, c.intitule_poste, c.statut::text,
    c.disponibilite, c.disponible_le, c.disponibilite_maj_le, c.localisation, c.mobilite,
    p.annees_experience, p.seniorite, p.resume,
    coalesce((select jsonb_agg(jsonb_build_object('competence_id', cc.competence_id, 'nom', k.nom_canonique, 'annees', cc.annees))
              from consultant_competences cc join competences k on k.id = cc.competence_id where cc.consultant_id = c.id), '[]'::jsonb),
    (select d.url_web from documents d
      where d.consultant_id = c.id and d.type = 'pdf_anonyme' and not d.supprime_sharepoint
      order by d.modifie_sharepoint_le desc nulls last limit 1),
    (select d.url_web from documents d
      where d.consultant_id = c.id and d.type = 'word_nominatif' and not d.supprime_sharepoint and d.url_web ilike '%sharepoint.com%'
      order by d.modifie_sharepoint_le desc nulls last limit 1)
  from (select distinct id from retenus) r
  join consultants c on c.id = r.id
  left join profils p on p.consultant_id = c.id
  where c.statut <> 'inactif'
  limit 2000;
$$;
revoke all on function candidats_recherche(uuid[], text[], uuid[]) from public, anon;
grant execute on function candidats_recherche(uuid[], text[], uuid[]) to authenticated;
