-- Mémoire du matching contextuel : pour chaque compétence, les personnes dont un texte (CV, Excel, poste) la cite.
-- Calculée à la demande (une requête indexée par compétence), réutilisée une heure. Aucune IA.
create table if not exists competences_textes (
  competence_id  uuid primary key references competences (id) on delete cascade,
  motif          text not null,
  consultants    uuid[] not null,
  calcule_le     timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table competences_textes enable row level security;
revoke all on competences_textes from public, anon, authenticated;

create or replace function consultants_par_competences(p_ids uuid[], p_motifs text[])
returns table (competence_id uuid, consultants uuid[])
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare
  i int;
  liste uuid[];
begin
  -- Utilisateur connecté : actif obligatoire. Tâches du serveur (clé secrète) : autorisées. Visiteurs : aucun droit d'exécution.
  if auth.uid() is not null and not est_utilisateur_actif() then return; end if;
  for i in 1 .. coalesce(array_length(p_ids, 1), 0) loop
    select ct.consultants into liste from competences_textes ct
      where ct.competence_id = p_ids[i] and ct.motif = p_motifs[i] and ct.calcule_le > now() - interval '1 hour';
    if liste is null then
      -- Motif en constante : l'index trigramme des textes est utilisé.
      execute format('select coalesce(array_agg(t.consultant_id), ''{}'') from textes_consultants t join consultants c on c.id = t.consultant_id and c.statut <> ''inactif'' where t.texte ~ %L', p_motifs[i])
        into liste;
      insert into competences_textes (competence_id, motif, consultants, calcule_le) values (p_ids[i], p_motifs[i], liste, now())
        on conflict (competence_id) do update set motif = excluded.motif, consultants = excluded.consultants, calcule_le = excluded.calcule_le;
    end if;
    competence_id := p_ids[i];
    consultants := liste;
    return next;
    liste := null;
  end loop;
end;
$$;
revoke all on function consultants_par_competences(uuid[], text[]) from public, anon;
grant execute on function consultants_par_competences(uuid[], text[]) to authenticated;

-- Préparé chaque heure pour les missions ouvertes (après le rafraîchissement des textes à :50) : les écrans restent rapides.
create or replace function preparer_competences_textes()
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform consultants_par_competences(array_agg(ct.competence_id), array_agg(ct.motif))
  from competences_textes ct
  where ct.competence_id in (select mc.competence_id from mission_competences mc join missions m on m.id = mc.mission_id where m.statut = 'ouverte')
    and ct.calcule_le < now() - interval '30 minutes';
end;
$$;
revoke all on function preparer_competences_textes() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('ats-competences-textes', '55 * * * *', 'select public.preparer_competences_textes()');
  end if;
end $$;
