-- Nuit du 24 au 25/11/2026 (décisions de l'utilisatrice) :
-- - candidats des offres Collective actives : parcours lu par l'IA en lot de nuit (lecture_ia = vrai) ;
-- - candidats des offres expirées : fiche + CV dans l'outil et dans SharePoint, SANS IA (lecture_ia = faux) tant que le
--   budget n'est pas rechargé (ni lecture du parcours, ni découpage, ni matching).
alter table public.imports_collective add column if not exists lecture_ia boolean not null default true;
alter table public.imports_collective add column if not exists parcours_le timestamptz;

create or replace function public.cv_a_decouper(p_limite integer default 2000)
returns table(consultant_id uuid, document_id uuid, texte text, texte_hash text)
language sql
stable
security definer
set search_path = public
as $$
  with choix as (
    select distinct on (d.consultant_id) d.consultant_id, d.id, d.texte_extrait
    from documents d
    where d.consultant_id is not null and d.texte_extractible and d.texte_extrait is not null and length(d.texte_extrait) > 200
      and not coalesce(d.supprime_sharepoint, false)
      and coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
      -- Candidats d'offres Collective expirées : pas d'IA (décision du 24/11/2026).
      and not exists (select 1 from imports_collective i where i.consultant_id = d.consultant_id and not i.lecture_ia)
    order by d.consultant_id, (d.type = 'word_nominatif') desc, d.modifie_sharepoint_le desc nulls last, d.created_at desc
  )
  select c.consultant_id, c.id, c.texte_extrait, md5(c.texte_extrait)
  from choix c
  left join dossiers_cv x on x.consultant_id = c.consultant_id
  where x.consultant_id is null or x.texte_hash <> md5(c.texte_extrait)
  limit p_limite;
$$;
