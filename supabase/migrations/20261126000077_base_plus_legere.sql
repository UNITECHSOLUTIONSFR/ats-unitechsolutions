-- Base plus légère (26/11/2026, accord de l'utilisatrice : « un outil fluide ») : chaque travail ne touche que ce qui change.

-- 1. Liste Consultants : quand des fiches sont ajoutées, les autres lignes hors Excel sont décalées par la base elle-même
--    (position + empreinte), sans relire ni recalculer toute la liste.
create or replace function public.decaler_hors_excel(p_nombre integer)
returns void language sql security definer set search_path = public as $$
  update tableau_vue
     set position = position + p_nombre,
         empreinte = split_part(empreinte, ':', 1) || ':' || (position + p_nombre)
   where id like 'fiche:%';
$$;
revoke execute on function public.decaler_hors_excel(integer) from public, anon, authenticated;
grant execute on function public.decaler_hors_excel(integer) to service_role;

-- 3. Travaux de nuit étalés : la tâche Collective ne démarre plus aux mêmes minutes que le matching et les textes (:x0),
--    et la mise à jour des compétences (toutes les 3 h) passe à :15, loin des autres.
do $$
declare v_id bigint;
begin
  if to_regclass('cron.job') is null then return; end if;
  select jobid into v_id from cron.job where jobname = 'ats-collective';
  if v_id is not null then perform cron.alter_job(v_id, schedule := '2-59/5 0-4,18-23 * * *'); end if;
  select jobid into v_id from cron.job where jobname = 'ats-competences-textes';
  if v_id is not null then perform cron.alter_job(v_id, schedule := '15 */3 * * *'); end if;
end $$;
