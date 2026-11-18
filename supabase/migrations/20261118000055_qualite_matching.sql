-- Mesure de la qualité du matching (18/11/2026) : les profils que l'équipe a vraiment envoyés au client ou fait retenir
-- (appelés, envoyés au client, retenus) sortent-ils dans les 10 premiers du classement actuel de la mission ?
create or replace function public.qualite_matching()
returns table(decisions bigint, dans_top10 bigint, dans_top3 bigint) language sql stable security definer set search_path = public as $$
  with d as (
    select p.consultant_id, c.top from propositions p join classements_mission c on c.mission_id = p.mission_id
    where p.statut in ('appele', 'envoye_client', 'retenu') and c.calcule_le is not null
  ), r as (
    select (select min(i) from jsonb_array_elements(d.top) with ordinality e(l, i)
            where e.l ->> 'consultant_id' = d.consultant_id::text and coalesce((e.l ->> 'eligible')::boolean, true)) as rang
    from d
  )
  select count(*), count(*) filter (where rang <= 10), count(*) filter (where rang <= 3) from r;
$$;
revoke execute on function public.qualite_matching() from public, anon, authenticated;
grant execute on function public.qualite_matching() to service_role;
