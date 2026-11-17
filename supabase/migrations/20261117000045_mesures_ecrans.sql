-- Vitesse : temps réels d'affichage des écrans, mesurés dans le navigateur de l'équipe (clic → écran affiché).
-- Aucune donnée personnelle : l'écran (identifiants remplacés par « [id] »), la durée, le type (ouverture ou navigation), le rôle.
create table if not exists mesures_ecrans (
  id          bigint generated always as identity primary key,
  ecran       text not null,
  duree_ms    integer not null check (duree_ms between 0 and 120000),
  type        text not null check (type in ('ouverture', 'navigation')),
  role        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists mesures_ecrans_date on mesures_ecrans (created_at desc);
create trigger mesures_ecrans_maj_updated_at before update on mesures_ecrans for each row execute function maj_updated_at();
alter table mesures_ecrans enable row level security;
-- Écriture et lecture par le serveur seulement (clé secrète) ; l'écran d'administration lit par le serveur.
revoke all on mesures_ecrans from public, anon, authenticated;

-- Index utiles aux écrans les plus consultés (mesures du 17/11/2026).
create index if not exists consultants_cree_le on consultants (created_at desc);
create index if not exists documents_type on documents (type);

-- Synthèse par écran (médiane et 95e centile = temps sous lequel passent 95 % des affichages).
create or replace function vitesse_ecrans(p_jours integer)
returns table (ecran text, nombre bigint, mediane_ms integer, p95_ms integer)
language sql stable security invoker set search_path = public as $$
  select ecran, count(*), round(percentile_cont(0.5) within group (order by duree_ms))::int,
         round(percentile_cont(0.95) within group (order by duree_ms))::int
  from mesures_ecrans where created_at > now() - make_interval(days => p_jours)
  group by ecran order by count(*) desc limit 40;
$$;
revoke all on function vitesse_ecrans(integer) from public, anon, authenticated;

-- Nombre de profils qui ont chaque compétence demandée (écran mission) : compté par la base au lieu de renvoyer
-- des milliers de lignes au serveur.
create or replace function profils_par_competence(p_ids uuid[])
returns table (competence_id uuid, nombre bigint)
language sql stable security invoker set search_path = public as $$
  select competence_id, count(*) from consultant_competences where competence_id = any (p_ids) group by competence_id;
$$;
revoke all on function profils_par_competence(uuid[]) from public, anon;
grant execute on function profils_par_competence(uuid[]) to authenticated;

-- Bilan du jour : dernière réussite et dernier échec de chaque tâche, en une lecture.
create or replace function dernieres_executions()
returns table (type text, reussite timestamptz, echec timestamptz)
language sql stable security invoker set search_path = public as $$
  select type, max(debut) filter (where statut = 'termine'), max(debut) filter (where statut = 'echec') from executions group by type;
$$;
revoke all on function dernieres_executions() from public, anon;
grant execute on function dernieres_executions() to authenticated;

-- Recherche par le sens : index HNSW (recherche approchée rapide) pour ne pas relire les 5 000 empreintes à chaque mission
-- (6 s quand elles ne sont plus en mémoire, sur la petite machine de la base).
create index if not exists empreintes_consultants_hnsw on empreintes_consultants using hnsw (empreinte vector_cosine_ops);
create or replace function proches_mission(p_mission_id uuid, p_nombre integer)
returns table (consultant_id uuid, similarite double precision)
language sql stable security invoker set search_path = public
-- Assez de voisins examinés pour en rendre 250 (les fiches inactives sont écartées ensuite).
set hnsw.ef_search = 500 as $$
  with m as materialized (select empreinte from empreintes_missions where mission_id = p_mission_id),
  proches as (
    select e.consultant_id, e.empreinte <=> (select empreinte from m) as distance
    from empreintes_consultants e
    order by e.empreinte <=> (select empreinte from m)
    limit least(greatest(p_nombre, 1), 1000) * 2
  )
  select p.consultant_id, 1 - p.distance
  from proches p join consultants c on c.id = p.consultant_id
  where c.statut <> 'inactif'
  order by p.distance
  limit least(greatest(p_nombre, 1), 1000);
$$;
revoke all on function proches_mission(uuid, integer) from public, anon, authenticated;

-- Empreintes en demi-précision (halfvec : moitié moins de mémoire, précision suffisante pour comparer des sens),
-- rangées dans la ligne elle-même (pas de lecture à part) : la recherche par le sens reste rapide sur la petite machine.
-- (Base de test locale avec un pgvector ancien, sans halfvec : empreintes laissées en pleine précision.)
drop index if exists empreintes_consultants_hnsw;
do $$
begin
  if exists (select 1 from pg_type where typname = 'halfvec') then
    alter table empreintes_consultants alter column empreinte type halfvec(1024) using empreinte::halfvec(1024);
    alter table empreintes_missions alter column empreinte type halfvec(1024) using empreinte::halfvec(1024);
    alter table empreintes_consultants alter column empreinte set storage plain;
    alter table empreintes_missions alter column empreinte set storage plain;
    update empreintes_consultants set empreinte = empreinte;
    update empreintes_missions set empreinte = empreinte;
    create index if not exists empreintes_consultants_hnsw on empreintes_consultants using hnsw (empreinte halfvec_cosine_ops);
  else
    create index if not exists empreintes_consultants_hnsw on empreintes_consultants using hnsw (empreinte vector_cosine_ops);
  end if;
end $$;

-- Tâches du serveur (clé secrète) : jusqu'à 60 s par requête (recalculs en arrière-plan) ; les écrans restent limités à 8 s.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    alter role service_role set statement_timeout = '60s';
  end if;
end $$;
notify pgrst, 'reload config';
