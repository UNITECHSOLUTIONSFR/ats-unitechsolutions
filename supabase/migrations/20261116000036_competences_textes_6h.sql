-- Vitesse : la liste des personnes dont les textes citent une compétence est gardée 6 heures (au lieu d'une) :
-- les classements préparés chaque heure ne refont plus toutes les recherches dans les 30 Mo de textes.
CREATE OR REPLACE FUNCTION public.consultants_par_competences(p_ids uuid[], p_motifs text[])
 RETURNS TABLE(competence_id uuid, consultants uuid[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  i int;
  liste uuid[];
begin
  -- Utilisateur connecté : actif obligatoire. Tâches du serveur (clé secrète) : autorisées. Visiteurs : aucun droit d'exécution.
  if auth.uid() is not null and not est_utilisateur_actif() then return; end if;
  for i in 1 .. coalesce(array_length(p_ids, 1), 0) loop
    select ct.consultants into liste from competences_textes ct
      where ct.competence_id = p_ids[i] and ct.motif = p_motifs[i] and ct.calcule_le > now() - interval '6 hours';
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
$function$;
