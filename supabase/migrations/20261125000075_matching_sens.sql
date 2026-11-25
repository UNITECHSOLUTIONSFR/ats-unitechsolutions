-- Nouveau matching (décision de l'utilisatrice du 25/11/2026) : comme les outils du marché.
-- 1. Chaque mission est comparée PAR LE SENS à TOUS les CV lisibles de la base (empreintes Voyage), sans tri préalable ;
-- 2. l'IA lit en entier les 500 plus proches et les note critère par critère ;
-- 3. un nouveau CV est comparé aux missions ouvertes dès qu'il a son empreinte.

-- Ressemblance de sens la plus basse parmi les 500 retenus : un nouveau CV au moins aussi proche est lu pour cette mission.
alter table public.classements_mission add column if not exists seuil_sens real;

-- Les CV lisibles les plus proches d'une mission, par le sens (toute la base, aucun filtre de métier ni de compétence).
create or replace function public.classement_sens(p_mission uuid, p_limite integer default 500)
returns table(consultant_id uuid, sim real)
language sql stable security definer set search_path = public as $$
  select e.consultant_id, (1 - (e.empreinte <=> m.empreinte))::real as sim
  from empreintes_consultants e
  cross join (select empreinte from empreintes_missions where mission_id = p_mission) m
  where exists (select 1 from documents d where d.consultant_id = e.consultant_id and d.texte_extractible
                  and not coalesce(d.supprime_sharepoint, false) and length(coalesce(d.texte_extrait, '')) > 200)
  order by e.empreinte <=> m.empreinte
  limit p_limite;
$$;

-- Ressemblance de quelques CV avec une mission (nouveaux CV).
create or replace function public.sens_consultants(p_mission uuid, p_ids uuid[])
returns table(consultant_id uuid, sim real)
language sql stable security definer set search_path = public as $$
  select e.consultant_id, (1 - (e.empreinte <=> m.empreinte))::real
  from empreintes_consultants e cross join (select empreinte from empreintes_missions where mission_id = p_mission) m
  where e.consultant_id = any(p_ids);
$$;

-- Texte complet du CV de référence de chaque consultant (Word nominatif d'abord, le plus récent), pour la lecture par l'IA.
create or replace function public.textes_cv_complets(p_ids uuid[])
returns table(consultant_id uuid, texte text, texte_hash text)
language sql stable security definer set search_path = public as $$
  select distinct on (d.consultant_id) d.consultant_id, d.texte_extrait, md5(d.texte_extrait)
  from documents d
  where d.consultant_id = any(p_ids) and d.texte_extractible and not coalesce(d.supprime_sharepoint, false)
    and length(coalesce(d.texte_extrait, '')) > 200
  order by d.consultant_id, (d.type = 'word_nominatif') desc, d.modifie_sharepoint_le desc nulls last, d.created_at desc;
$$;

revoke execute on function public.classement_sens(uuid, integer) from public, anon, authenticated;
revoke execute on function public.sens_consultants(uuid, uuid[]) from public, anon, authenticated;
revoke execute on function public.textes_cv_complets(uuid[]) from public, anon, authenticated;
grant execute on function public.classement_sens(uuid, integer) to service_role;
grant execute on function public.sens_consultants(uuid, uuid[]) to service_role;
grant execute on function public.textes_cv_complets(uuid[]) to service_role;
