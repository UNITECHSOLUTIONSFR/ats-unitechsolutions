-- Planificateur de secours (Supabase) : la lecture de Trello est lancée chaque heure, comme les emails
-- (GitHub ne déclenche ses tâches planifiées que quelques fois par jour).
CREATE OR REPLACE FUNCTION public.lancer_tache_planifiee(p_tache text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_secret text;
begin
  if p_tache not in ('excel', 'cv', 'emails', 'sauvegarde', 'trello') then
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
$function$;

select cron.schedule('ats-trello', '7 * * * *', $$select public.lancer_tache_planifiee('trello')$$);
