-- Vitesse (25/11/2026) : compétences de quelques fiches seulement, triées exactement comme pour toute la base
-- (mise à jour ciblée de l'écran Consultants après l'enregistrement d'une fiche).
create or replace function public.competences_consultants_json_ids(p_ids uuid[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(consultant_id, competences), '{}'::jsonb) from (
    select cc.consultant_id, string_agg(c.nom_canonique, ' · ' order by c.nom_canonique) as competences
    from consultant_competences cc join competences c on c.id = cc.competence_id
    where cc.consultant_id = any(p_ids) group by cc.consultant_id
  ) t;
$$;
revoke execute on function public.competences_consultants_json_ids(uuid[]) from public, anon, authenticated;
grant execute on function public.competences_consultants_json_ids(uuid[]) to service_role;
