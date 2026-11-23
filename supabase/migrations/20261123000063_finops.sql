-- FinOps (23/11/2026) : dépense IA calculée par la base (somme exacte, sans limite de 1 000 lignes),
-- plafond par jour en plus du plafond du mois, relecture IA du matching coupée par défaut.
create or replace function public.cout_ia_depuis(p_depuis timestamptz)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(cout_estime_usd), 0) from ai_usage
  where created_at >= p_depuis
    and (select public.est_utilisateur_actif() or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role');
$$;
revoke all on function public.cout_ia_depuis(timestamptz) from public, anon;
grant execute on function public.cout_ia_depuis(timestamptz) to authenticated, service_role;

create index if not exists ai_usage_created_at_idx on public.ai_usage (created_at);

insert into public.reglages (cle, valeur) values ('plafond_ia_jour_usd', '1'::jsonb) on conflict (cle) do nothing;
insert into public.reglages (cle, valeur) values ('matching_lecture_ia', 'false'::jsonb) on conflict (cle) do nothing;
