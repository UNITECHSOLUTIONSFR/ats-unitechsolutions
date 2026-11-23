-- Matching v3 (23/11/2026) : chaque CV est découpé UNE fois en expériences (rôle, dates, technologies, responsabilités),
-- chaque expérience a son empreinte de sens. Pour une mission, la base note TOUS les CV : même métier (ou voisin) d'abord,
-- puis chaque exigence avec l'expérience qui la prouve. Aucune relecture payante des CV par mission.

-- Dossier d'un consultant : CV lu, métier réellement exercé, années d'expérience.
create table if not exists public.dossiers_cv (
  consultant_id uuid primary key references public.consultants(id) on delete cascade,
  document_id uuid references public.documents(id) on delete set null,
  texte_hash text not null,
  metier_principal text,
  metiers text[] not null default '{}',
  annees_total numeric,
  empreinte vector(1024),
  modele text,
  version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.experiences_cv (
  id uuid primary key default gen_random_uuid(),
  consultant_id uuid not null references public.consultants(id) on delete cascade,
  ordre int not null,
  role text not null,
  metier text,
  entreprise text,
  debut date,
  fin date,            -- null = en cours
  duree_mois int,
  technologies text[] not null default '{}',
  responsabilites text,
  texte text not null, -- texte comparé (rôle, métier, responsabilités, technologies)
  empreinte vector(1024),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists experiences_cv_consultant on public.experiences_cv (consultant_id);

-- Ce que cherche une mission : son métier et ses exigences, avec leur empreinte (une ligne par élément).
create table if not exists public.exigences_v3 (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  type text not null check (type in ('metier', 'exigence')),
  ordre int not null,
  libelle text not null,
  poids numeric not null default 1,
  motifs text[] not null default '{}',
  texte text not null,
  empreinte vector(1024),
  source_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists exigences_v3_mission on public.exigences_v3 (mission_id);

-- Vérification de la qualité : lecture complète des CV par un modèle plus puissant (référence), une fois.
create table if not exists public.jugements_reference (
  mission_id uuid not null references public.missions(id) on delete cascade,
  consultant_id uuid not null references public.consultants(id) on delete cascade,
  bon boolean not null,
  note int,
  raison text,
  modele text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (mission_id, consultant_id)
);

-- Retours de l'équipe sur un profil pour une mission (« bon profil » / « pas pour cette mission »).
create table if not exists public.retours_matching (
  mission_id uuid not null references public.missions(id) on delete cascade,
  consultant_id uuid not null references public.consultants(id) on delete cascade,
  avis text not null check (avis in ('bon', 'pas')),
  par uuid references public.utilisateurs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (mission_id, consultant_id)
);

alter table public.dossiers_cv enable row level security;
alter table public.experiences_cv enable row level security;
alter table public.exigences_v3 enable row level security;
alter table public.jugements_reference enable row level security;
alter table public.retours_matching enable row level security;
drop policy if exists dossiers_cv_lecture on public.dossiers_cv;
create policy dossiers_cv_lecture on public.dossiers_cv for select to authenticated using ((select est_utilisateur_actif()));
drop policy if exists experiences_cv_lecture on public.experiences_cv;
create policy experiences_cv_lecture on public.experiences_cv for select to authenticated using ((select est_utilisateur_actif()));
drop policy if exists exigences_v3_lecture on public.exigences_v3;
create policy exigences_v3_lecture on public.exigences_v3 for select to authenticated using ((select est_utilisateur_actif()));
drop policy if exists jugements_reference_lecture on public.jugements_reference;
create policy jugements_reference_lecture on public.jugements_reference for select to authenticated using ((select est_admin()));
drop policy if exists retours_matching_lecture on public.retours_matching;
create policy retours_matching_lecture on public.retours_matching for select to authenticated using ((select est_utilisateur_actif()));
drop policy if exists retours_matching_ecriture on public.retours_matching;
create policy retours_matching_ecriture on public.retours_matching for all to authenticated
  using ((select est_utilisateur_actif())) with check ((select est_utilisateur_actif()));

-- Empreintes en demi-précision quand la base le permet (comme empreintes_consultants).
do $$
begin
  if exists (select 1 from pg_type where typname = 'halfvec') then
    alter table public.dossiers_cv alter column empreinte type halfvec(1024) using empreinte::halfvec(1024);
    alter table public.experiences_cv alter column empreinte type halfvec(1024) using empreinte::halfvec(1024);
    alter table public.exigences_v3 alter column empreinte type halfvec(1024) using empreinte::halfvec(1024);
  end if;
end $$;

/**
 * Pour une mission : chaque consultant découpé reçoit sa proximité de métier (meilleure expérience, les récentes comptent
 * davantage) et, pour chaque exigence, l'expérience qui la prouve le mieux (sens + bonus si le mot exact y figure).
 * Toute la base est notée, sans liste tronquée ; la note finale est calculée par l'application (matching/v3.ts).
 */
create or replace function public.classement_v3(p_mission uuid)
returns table(consultant_id uuid, metier_sim real, metier_role text, exigences jsonb, annees numeric)
language sql
stable
security definer
set search_path = public
as $$
  with acces as (
    select (select public.est_utilisateur_actif() or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role') ok
  ),
  m as (select e.empreinte from exigences_v3 e where e.mission_id = p_mission and e.type = 'metier' and e.empreinte is not null limit 1),
  ex as (select e.id, e.ordre, e.libelle, e.poids, e.motifs, e.empreinte from exigences_v3 e where e.mission_id = p_mission and e.type = 'exigence' and e.empreinte is not null),
  xp as (
    select x.*, case when x.fin is null or x.fin >= current_date - interval '3 years' then 1.0
                     when x.fin >= current_date - interval '6 years' then 0.92 else 0.8 end as rec
    from experiences_cv x, acces where acces.ok and x.empreinte is not null
  ),
  met as (
    select distinct on (xp.consultant_id) xp.consultant_id, ((1 - (xp.empreinte <=> m.empreinte)) * xp.rec)::real s, xp.role
    from xp, m order by xp.consultant_id, 2 desc
  ),
  best as (
    select distinct on (xp.consultant_id, ex.id) xp.consultant_id, ex.ordre, ex.libelle, ex.poids,
      (1 - (xp.empreinte <=> ex.empreinte))::real s,
      exists (select 1 from unnest(ex.motifs) mo where xp.texte ~* mo) x,
      xp.role, xp.entreprise, xp.debut, xp.fin, xp.duree_mois
    from xp cross join ex
    order by xp.consultant_id, ex.id, 7 desc, 6 desc
  ),
  agg as (
    select b.consultant_id, jsonb_agg(jsonb_build_object('ordre', b.ordre, 'libelle', b.libelle, 'poids', b.poids, 's', round(b.s::numeric, 3), 'x', b.x,
      'role', b.role, 'entreprise', b.entreprise, 'debut', b.debut, 'fin', b.fin, 'duree_mois', b.duree_mois) order by b.ordre) ex
    from best b group by b.consultant_id
  )
  select d.consultant_id, coalesce(met.s, 0)::real, met.role, coalesce(agg.ex, '[]'::jsonb), d.annees_total
  from dossiers_cv d
  join acces on acces.ok
  left join agg on agg.consultant_id = d.consultant_id
  left join met on met.consultant_id = d.consultant_id;
$$;
revoke all on function public.classement_v3(uuid) from public, anon;
grant execute on function public.classement_v3(uuid) to authenticated, service_role;

insert into public.reglages (cle, valeur) values ('matching_v3', 'false'::jsonb) on conflict (cle) do nothing;

-- CV à découper : le CV le plus récent de chaque consultant (Word nominatif d'abord), absent de dossiers_cv ou modifié.
create or replace function public.cv_a_decouper(p_limite int default 2000)
returns table(consultant_id uuid, document_id uuid, texte text, texte_hash text)
language sql
stable
security definer
set search_path = public
as $$
  with choix as (
    select distinct on (d.consultant_id) d.consultant_id, d.id, d.texte_extrait
    from documents d
    where d.consultant_id is not null and d.texte_extractible and d.texte_extrait is not null and length(d.texte_extrait) > 200
      and not coalesce(d.supprime_sharepoint, false)
      and coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
    order by d.consultant_id, (d.type = 'word_nominatif') desc, d.modifie_sharepoint_le desc nulls last, d.created_at desc
  )
  select c.consultant_id, c.id, c.texte_extrait, md5(c.texte_extrait)
  from choix c
  left join dossiers_cv x on x.consultant_id = c.consultant_id
  where x.consultant_id is null or x.texte_hash <> md5(c.texte_extrait)
  limit p_limite;
$$;
revoke all on function public.cv_a_decouper(int) from public, anon, authenticated;
grant execute on function public.cv_a_decouper(int) to service_role;
