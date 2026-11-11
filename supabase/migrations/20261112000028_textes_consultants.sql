-- Matching contextuel : tout le texte connu d'une personne (CV Word, CV reçus, PDF anonymisés, ligne de l'Excel, poste, notes)
-- réuni et indexé, pour retrouver une compétence même quand le CV n'a pas été analysé par l'IA. Aucune IA.
create extension if not exists pg_trgm;

drop materialized view if exists textes_consultants;
create materialized view textes_consultants as
  select consultant_id, lower(string_agg(t, ' ')) as texte
  from (
    select d.consultant_id, d.texte_extrait as t from documents d
      where d.consultant_id is not null and not d.supprime_sharepoint and d.texte_extrait is not null
    union all
    select l.consultant_id, (select string_agg(v, ' ') from jsonb_each_text(l.valeurs) as e(k, v)) from tableau_lignes l where l.consultant_id is not null
    union all
    select c.id, concat_ws(' ', c.intitule_poste, c.notes) from consultants c
  ) x
  where t is not null
  group by consultant_id;
create unique index textes_consultants_id on textes_consultants (consultant_id);
create index textes_consultants_trgm on textes_consultants using gin (texte gin_trgm_ops);
revoke all on textes_consultants from public, anon, authenticated;

-- Pour chaque motif (expression régulière, minuscules), les personnes dont un texte le contient.
create or replace function consultants_par_motifs(p_motifs text[])
returns table (consultant_id uuid, trouves int[])
language plpgsql stable security definer set search_path = public as $$
begin
  -- Utilisateur connecté : actif obligatoire. Tâches du serveur (clé secrète, sans utilisateur) : autorisées. Visiteurs : aucun droit d'exécution.
  if auth.uid() is not null and not est_utilisateur_actif() then return; end if;
  return query
    select t.consultant_id, array_agg(m.i::int order by m.i)
    from unnest(p_motifs) with ordinality as m(motif, i)
    join textes_consultants t on t.texte ~ m.motif
    join consultants c on c.id = t.consultant_id and c.statut <> 'inactif'
    group by t.consultant_id;
end;
$$;
revoke all on function consultants_par_motifs(text[]) from public, anon;
grant execute on function consultants_par_motifs(text[]) to authenticated;

-- Rafraîchi chaque heure (nouveaux CV, emails, Excel) ; base de test sans pg_cron : sauté.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('ats-textes', '50 * * * *', 'refresh materialized view concurrently textes_consultants');
  end if;
end $$;
