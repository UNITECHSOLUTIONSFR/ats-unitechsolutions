-- Tâche Excel coupée en deux (17/11/2026) : l'écriture dans l'Excel (2 h 05) et sa relecture complète (2 h 25)
-- ont chacune leurs 5 minutes ; ensemble, elles dépassaient la limite de l'hébergeur.
CREATE OR REPLACE FUNCTION public.lancer_tache_planifiee(p_tache text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_secret text;
begin
  if p_tache not in ('excel', 'cv', 'emails', 'sauvegarde', 'trello', 'matching', 'excel_lecture') then
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

-- (Base de test locale sans pg_cron : la planification est sautée.)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('ats-excel-lecture', '25 1 * * *', 'select public.lancer_tache_planifiee(''excel_lecture'')');
  end if;
end $$;
