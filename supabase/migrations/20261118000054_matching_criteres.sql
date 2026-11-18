-- Matching v2 (18/11/2026) : la base cherche, l'IA départage.
-- Critères de la mission (métier + critères obligatoires avec synonymes), lus par l'IA ou corrigés par l'équipe.
alter table public.missions add column if not exists criteres_matching jsonb;
alter table public.missions add column if not exists criteres_texte text;      -- empreinte du texte lu (relu seulement s'il change)
alter table public.missions add column if not exists criteres_par_equipe boolean not null default false; -- corrigés à la main : plus réécrits par l'IA

-- Profils qui remplissent TOUS les motifs (une expression par critère, synonymes séparés par « | »), dans le texte complet :
-- CV, ligne de l'Excel, poste et notes (vue textes_consultants, en minuscules). Réservé au serveur.
create or replace function public.profils_eligibles(p_motifs text[])
returns setof uuid language sql stable security definer set search_path = public as $$
  select t.consultant_id from textes_consultants t
  where not exists (select 1 from unnest(p_motifs) m where t.texte !~ m);
$$;

-- Pour quelques profils : quels motifs ils remplissent (1 = oui), dans l'ordre des motifs.
create or replace function public.motifs_par_profil(p_motifs text[], p_ids uuid[])
returns table(consultant_id uuid, remplis boolean[]) language sql stable security definer set search_path = public as $$
  select t.consultant_id, array(select t.texte ~ m from unnest(p_motifs) with ordinality u(m, i) order by i)
  from textes_consultants t where t.consultant_id = any(p_ids);
$$;

revoke execute on function public.profils_eligibles(text[]) from public, anon, authenticated;
revoke execute on function public.motifs_par_profil(text[], uuid[]) from public, anon, authenticated;
grant execute on function public.profils_eligibles(text[]) to service_role;
grant execute on function public.motifs_par_profil(text[], uuid[]) to service_role;

-- Nombre de profils qui remplissent tous les critères (affiché sur la mission).
alter table public.classements_mission add column if not exists eligibles integer;
