-- Appliqué le soir (modifie la table des documents : à ne pas faire pendant les heures de travail).
-- 2. Matching par le sens : « ce CV est-il lisible ? » est calculé une seule fois, quand le document est enregistré,
--    au lieu de relire le texte complet de chaque CV à chaque mission (9 à 42 s par mission).
alter table public.documents add column if not exists texte_lisible boolean
  generated always as (coalesce(texte_extractible, false) and length(coalesce(texte_extrait, '')) > 200) stored;
create index if not exists documents_lisibles on public.documents (consultant_id)
  where texte_lisible and not coalesce(supprime_sharepoint, false);

create or replace function public.classement_sens(p_mission uuid, p_limite integer default 500)
returns table(consultant_id uuid, sim real)
language sql stable security definer set search_path = public as $$
  with lisibles as (
    select distinct d.consultant_id from documents d
    where d.texte_lisible and not coalesce(d.supprime_sharepoint, false) and d.consultant_id is not null
  )
  select e.consultant_id, (1 - (e.empreinte <=> m.empreinte))::real as sim
  from empreintes_consultants e
  join lisibles l on l.consultant_id = e.consultant_id
  cross join (select empreinte from empreintes_missions where mission_id = p_mission) m
  order by e.empreinte <=> m.empreinte
  limit p_limite;
$$;

create or replace function public.textes_cv_complets(p_ids uuid[])
returns table(consultant_id uuid, texte text, texte_hash text)
language sql stable security definer set search_path = public as $$
  select distinct on (d.consultant_id) d.consultant_id, d.texte_extrait, md5(d.texte_extrait)
  from documents d
  where d.consultant_id = any(p_ids) and d.texte_lisible and not coalesce(d.supprime_sharepoint, false)
  order by d.consultant_id, (d.type = 'word_nominatif') desc, d.modifie_sharepoint_le desc nulls last, d.created_at desc;
$$;

