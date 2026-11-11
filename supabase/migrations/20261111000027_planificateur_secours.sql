-- Planificateur de secours (Supabase pg_cron) : appelle les mêmes tâches que GitHub, 5 minutes après.
-- Le site ignore une tâche déjà faite (pas de double passage). Inactif tant que le secret « cron_secret »
-- n'a pas été enregistré dans le coffre-fort Supabase (Vault) par un administrateur. La valeur n'est jamais ici.
-- (Base de test locale sans pg_cron ni pg_net : les extensions et les planifications sont alors sautées.)
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then create extension if not exists pg_cron; end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create schema if not exists extensions;
    create extension if not exists pg_net with schema extensions;
  end if;
end $$;

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
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('ats-excel', '5 1 * * *', 'select public.lancer_tache_planifiee(''excel'')');
    perform cron.schedule('ats-cv', '35 1 * * *', 'select public.lancer_tache_planifiee(''cv'')');
    perform cron.schedule('ats-emails', '22 * * * *', 'select public.lancer_tache_planifiee(''emails'')');
    perform cron.schedule('ats-sauvegarde', '45 2 * * 1', 'select public.lancer_tache_planifiee(''sauvegarde'')');
  end if;
end $$;

-- Pour le bilan des administrateurs : le planificateur de secours est-il prêt ? (existence du secret seulement)
create or replace function planificateur_secours_pret()
returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return est_admin() and exists (select 1 from vault.secrets where name = 'cron_secret')
     and exists (select 1 from cron.job where jobname = 'ats-emails' and active);
end;
$$;
revoke all on function planificateur_secours_pret() from public, anon;
grant execute on function planificateur_secours_pret() to authenticated;
