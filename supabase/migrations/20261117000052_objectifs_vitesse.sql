-- Objectifs de vitesse (17/11/2026) : écrans et boutons, temps habituel et temps sous lequel passent 9 affichages sur 10.
create or replace function public.vitesse_ecrans_detail(p_jours integer)
returns table(ecran text, type text, nombre bigint, mediane_ms integer, p90_ms integer)
language sql stable set search_path = public as $$
  select ecran, type, count(*), round(percentile_cont(0.5) within group (order by duree_ms))::int,
         round(percentile_cont(0.9) within group (order by duree_ms))::int
  from mesures_ecrans where created_at > now() - make_interval(days => p_jours)
  group by ecran, type order by count(*) desc limit 60;
$$;
revoke execute on function public.vitesse_ecrans_detail(integer) from public, anon, authenticated;
grant execute on function public.vitesse_ecrans_detail(integer) to service_role;
