-- Phase 1 « vitesse » : le classement de chaque mission est calculé en arrière-plan et rangé ici.
-- Ouvrir une mission revient à lire cette ligne (aucun calcul). L'ancien classement reste affiché tant que le
-- nouveau n'est pas complet ; en cas d'échec, il reste consultable avec sa date.
create table if not exists classements_mission (
  mission_id        uuid primary key references missions (id) on delete cascade,
  total             integer not null default 0,
  pertinents        integer not null default 0,
  -- Les 60 premiers, avec le détail du score et l'avis de l'IA.
  top               jsonb not null default '[]'::jsonb,
  -- Score de chaque personne classée : { consultant_id: [score, écarté] } (fiches consultants).
  scores            jsonb not null default '{}'::jsonb,
  calcule_le        timestamptz,
  duree_ms          integer,
  -- Version du moteur : un changement de règles recalcule tout, un simple déploiement ne recalcule rien.
  version           text,
  -- Demande de recalcul (mission modifiée, nouvelles fiches) : traitée par la tâche « matching ».
  a_recalculer      boolean not null default true,
  demande_le        timestamptz not null default now(),
  -- Calcul en cours (évite deux calculs simultanés de la même mission).
  en_calcul_depuis  timestamptz,
  erreur            text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger classements_mission_maj_updated_at before update on classements_mission for each row execute function maj_updated_at();
create index if not exists classements_mission_a_recalculer on classements_mission (demande_le) where a_recalculer;

alter table classements_mission enable row level security;
-- Lecture par toute personne active ; écriture réservée au serveur (clé secrète).
create policy classements_mission_lecture on classements_mission for select to authenticated using ((select est_utilisateur_actif()));
revoke all on classements_mission from anon;

-- Réserve le calcul d'une mission (une seule à la fois) ; un calcul abandonné (serveur arrêté) est repris.
create or replace function reserver_calcul_classement(p_mission_id uuid, p_abandon_secondes integer)
returns boolean language plpgsql security invoker set search_path = public as $$
begin
  insert into classements_mission (mission_id) values (p_mission_id) on conflict (mission_id) do nothing;
  update classements_mission set en_calcul_depuis = now()
   where mission_id = p_mission_id
     and (en_calcul_depuis is null or en_calcul_depuis < now() - make_interval(secs => p_abandon_secondes));
  return found;
end;
$$;
revoke all on function reserver_calcul_classement(uuid, integer) from public, anon, authenticated;

-- Score d'une personne dans chaque classement rangé (fiche consultant) : une seule lecture au lieu d'un calcul par mission.
create or replace function scores_consultant(p_consultant_id uuid)
returns table (mission_id uuid, score numeric, ecarte boolean)
language sql stable security invoker set search_path = public as $$
  select c.mission_id, (c.scores -> p_consultant_id::text ->> 0)::numeric, (c.scores -> p_consultant_id::text ->> 1)::boolean
  from classements_mission c
  where c.scores ? p_consultant_id::text;
$$;
revoke all on function scores_consultant(uuid) from anon;

-- Place approchée d'une personne hors des 60 premiers : nombre de profils non écartés mieux notés.
create or replace function rang_dans_classement(p_mission_id uuid, p_score numeric)
returns integer language sql stable security invoker set search_path = public as $$
  select count(*)::integer from classements_mission c, jsonb_each(c.scores) e
  where c.mission_id = p_mission_id and not (e.value ->> 1)::boolean and (e.value ->> 0)::numeric > p_score;
$$;
revoke all on function rang_dans_classement(uuid, numeric) from anon;

-- Tâche « matching » (toutes les 10 minutes) : recalcule les classements demandés, ceux des nouvelles missions
-- et, chaque nuit, tous les classements des missions ouvertes.
CREATE OR REPLACE FUNCTION public.lancer_tache_planifiee(p_tache text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_secret text;
begin
  if p_tache not in ('excel', 'cv', 'emails', 'sauvegarde', 'trello', 'matching') then
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
    perform cron.schedule('ats-matching', '*/10 * * * *', 'select public.lancer_tache_planifiee(''matching'')');
  end if;
end $$;
