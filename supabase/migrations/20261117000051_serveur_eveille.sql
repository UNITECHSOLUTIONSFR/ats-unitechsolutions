-- Serveur gardé éveillé (17/11/2026) : un appel minuscule toutes les 5 minutes, de 6 h à 22 h (heure de Paris ≈ UTC+1),
-- pour que le premier clic après un moment de calme ne réveille pas le serveur (1 à 2 s d'attente).
-- (Base de test locale sans pg_cron : la planification est sautée.)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('ats-eveil', '*/5 5-21 * * *', $q$select net.http_get(url := 'https://ats-unitechsolutions.vercel.app/api/eveil', timeout_milliseconds := 10000)$q$);
  end if;
end $$;
