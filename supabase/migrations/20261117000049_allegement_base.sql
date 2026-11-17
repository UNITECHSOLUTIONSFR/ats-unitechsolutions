-- Allègement de la base (17/11/2026) : les tâches de fond ne doivent plus ralentir les écrans.

-- 1. Compétences de chaque consultant, en une seule lecture (au lieu de 5 à 10 pages qui refaisaient chacune tout le calcul).
create or replace function public.competences_consultants_json() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(consultant_id, competences), '{}'::jsonb) from (
    select cc.consultant_id, string_agg(c.nom_canonique, ' · ' order by c.nom_canonique) as competences
    from consultant_competences cc join competences c on c.id = cc.competence_id group by cc.consultant_id
  ) t;
$$;

-- 2. Empreintes des lignes de l'écran Consultants, en une seule lecture (au lieu de pages LIMIT/OFFSET sur une grosse table).
create or replace function public.tableau_vue_empreintes() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(id, empreinte), '{}'::jsonb) from tableau_vue;
$$;

revoke execute on function public.competences_consultants_json() from public, anon, authenticated;
revoke execute on function public.tableau_vue_empreintes() from public, anon, authenticated;
grant execute on function public.competences_consultants_json() to service_role;
grant execute on function public.tableau_vue_empreintes() to service_role;

-- 3. Les 10 premiers profils de chaque classement, rangés à part : la liste des missions et l'accueil
--    ne relisent plus le classement entier (100 profils détaillés) pour en afficher 3 à 10.
alter table public.classements_mission add column if not exists premiers jsonb
  generated always as (jsonb_path_query_array(top, '$[0 to 9]')) stored;

-- 4. Index de recherche plein texte des CV : refaits toutes les 3 heures (au lieu de toutes les heures).
do $$ begin
  perform cron.alter_job((select jobid from cron.job where jobname = 'ats-textes'), schedule := '50 */3 * * *');
  perform cron.alter_job((select jobid from cron.job where jobname = 'ats-competences-textes'), schedule := '55 */3 * * *');
exception when others then null; end $$;

-- 5. Temps des boutons (enregistrer, changer un statut…) mesurés comme les écrans.
alter table public.mesures_ecrans drop constraint if exists mesures_ecrans_type_check;
alter table public.mesures_ecrans add constraint mesures_ecrans_type_check check (type in ('ouverture', 'navigation', 'action'));
