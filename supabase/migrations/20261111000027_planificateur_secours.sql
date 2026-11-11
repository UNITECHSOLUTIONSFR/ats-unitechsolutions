-- Planificateur de secours (Supabase pg_cron) : appelle les mêmes tâches que GitHub, 5 minutes après.
-- Le site ignore une tâche déjà faite (pas de double passage). Inactif tant que le secret « cron_secret »
-- n'a pas été enregistré dans le coffre-fort Supabase (Vault) par un administrateur. La valeur n'est jamais ici.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function lancer_tache_planifiee(p_tache text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_secret text;
begin
  if p_tache not in ('excel', 'cv', 'emails', 'sauvegarde') then
    raise exception 'Tâche inconnue : %', p_tache;
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1;
  if v_secret is null or v_secret = '' then
    return; -- secret pas encore enregistré : rien n'est lancé
  end if;
  perform net.http_get(
    url := 'https://ats-unitechsolutions.vercel.app/api/cron/' || p_tache,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 330000
  );
end;
$$;
revoke all on function lancer_tache_planifiee(text) from public, anon, authenticated;

-- Heures en UTC (comme GitHub), décalées de 5 minutes.
select cron.schedule('ats-excel', '5 1 * * *', $$select public.lancer_tache_planifiee('excel')$$);
select cron.schedule('ats-cv', '35 1 * * *', $$select public.lancer_tache_planifiee('cv')$$);
select cron.schedule('ats-emails', '22 * * * *', $$select public.lancer_tache_planifiee('emails')$$);
select cron.schedule('ats-sauvegarde', '45 2 * * 1', $$select public.lancer_tache_planifiee('sauvegarde')$$);

-- Pour le bilan des administrateurs : le planificateur de secours est-il prêt ? (existence du secret seulement)
create or replace function planificateur_secours_pret()
returns boolean
language sql stable security definer set search_path = public as $$
  select est_admin() and exists (select 1 from vault.secrets where name = 'cron_secret')
     and exists (select 1 from cron.job where jobname = 'ats-emails' and active);
$$;
revoke all on function planificateur_secours_pret() from public, anon;
grant execute on function planificateur_secours_pret() to authenticated;
