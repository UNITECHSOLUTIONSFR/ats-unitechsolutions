-- Classement d'une mission plus rapide : on part des seuls consultants qui ont au moins une compétence demandée
-- (ou un profil très proche), au lieu de tester chaque fiche une à une. Même résultat, mêmes règles d'accès.
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
       mc as (select competence_id from mission_competences where mission_id = p_mission_id),
       retenus as (
         select cc.consultant_id as id from consultant_competences cc join mc using (competence_id)
         union
         select p.consultant_id from profils p, m
          where p.embedding is not null and m.embedding is not null and 1 - (p.embedding <=> m.embedding) > 0.8
         union
         select c.id from consultants c where not exists (select 1 from mc)
       )
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
  from retenus r
  join consultants c on c.id = r.id
  left join profils p on p.consultant_id = c.id
  cross join m
  where c.statut <> 'inactif';
$$;

-- Index utiles aux écrans (lecture du tableau, fiches, alertes, propositions).
create index if not exists tableau_lignes_onglet_position_idx on tableau_lignes (onglet_id, position);
create index if not exists tableau_lignes_consultant_idx on tableau_lignes (consultant_id);
create index if not exists propositions_consultant_idx on propositions (consultant_id);
create index if not exists alertes_consultant_idx on alertes (consultant_id);
create index if not exists consultants_source_idx on consultants (source);
