-- Nouvelle méthode de matching (décision du 17/11/2026) :
-- 1. présélection par le sens (empreintes Voyage AI, multilingue) combinée à la recherche par compétences exactes ;
-- 2. décision par l'IA : une note sur 100 et une raison pour chacun des 60 profils présélectionnés ;
-- 3. apprentissage : les décisions de l'équipe (appelé, envoyé au client, retenu, refusé) servent d'exemples à l'IA.

-- Empreintes de sens (1 024 nombres) : une par consultant, une par mission. Recalculées seulement si le texte change (empreinte_texte).
create table if not exists empreintes_consultants (
  consultant_id   uuid primary key references consultants (id) on delete cascade,
  empreinte       vector(1024) not null,
  empreinte_texte text not null,
  modele          text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create table if not exists empreintes_missions (
  mission_id      uuid primary key references missions (id) on delete cascade,
  empreinte       vector(1024) not null,
  empreinte_texte text not null,
  modele          text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger empreintes_consultants_maj_updated_at before update on empreintes_consultants for each row execute function maj_updated_at();
create trigger empreintes_missions_maj_updated_at before update on empreintes_missions for each row execute function maj_updated_at();
alter table empreintes_consultants enable row level security;
alter table empreintes_missions enable row level security;
-- Données techniques : lues et écrites par le serveur seulement (clé secrète).
revoke all on empreintes_consultants from public, anon, authenticated;
revoke all on empreintes_missions from public, anon, authenticated;

-- Texte résumant chaque consultant pour son empreinte : titre, résumé du CV analysé, compétences, puis CV / ligne Excel.
-- Seules les fiches sans empreinte ou dont le texte a changé sont renvoyées (au plus p_limite).
create or replace function textes_a_empreinter(p_limite integer)
returns table (consultant_id uuid, texte text, empreinte_texte text)
language sql stable security invoker set search_path = public as $$
  with textes as (
    select c.id,
      left(concat_ws(E'\n',
        'Poste : ' || nullif(c.intitule_poste, ''),
        'Résumé : ' || nullif(p.resume, ''),
        'Expérience : ' || p.annees_experience || ' ans',
        'Compétences : ' || (select string_agg(k.nom_canonique, ', ' order by cc.annees desc nulls last)
                             from consultant_competences cc join competences k on k.id = cc.competence_id where cc.consultant_id = c.id),
        'CV : ' || nullif(t.texte, '')), 8000) as texte
    from consultants c
    left join profils p on p.consultant_id = c.id
    left join textes_consultants t on t.consultant_id = c.id
    where c.statut <> 'inactif'
  )
  select x.id, x.texte, md5(x.texte)
  from textes x
  left join empreintes_consultants e on e.consultant_id = x.id
  where length(x.texte) > 20 and (e.consultant_id is null or e.empreinte_texte <> md5(x.texte))
  limit greatest(p_limite, 0);
$$;
revoke all on function textes_a_empreinter(integer) from public, anon, authenticated;

-- Les profils les plus proches d'une mission par le sens (similarité cosinus, de 0 à 1).
create or replace function proches_mission(p_mission_id uuid, p_nombre integer)
returns table (consultant_id uuid, similarite double precision)
language sql stable security invoker set search_path = public as $$
  select e.consultant_id, 1 - (e.empreinte <=> m.empreinte)
  from empreintes_missions m
  cross join empreintes_consultants e
  join consultants c on c.id = e.consultant_id
  where m.mission_id = p_mission_id and c.statut <> 'inactif'
  order by e.empreinte <=> m.empreinte
  limit least(greatest(p_nombre, 1), 1000);
$$;
revoke all on function proches_mission(uuid, integer) from public, anon, authenticated;

-- Note de l'IA (sur 100) à côté du verdict, pour chaque profil jugé.
alter table avis_matching add column if not exists note integer check (note between 0 and 100);
