-- Fusion de deux fiches d'une même personne (doublon), décidée par un administrateur.
-- Tout se fait en une seule opération : la fiche gardée reçoit les valeurs choisies, les documents, compétences,
-- propositions, lignes du tableau, emails et historique de l'autre ; l'autre fiche est ensuite supprimée (suppression tracée).
create or replace function fusionner_consultants(p_garde uuid, p_supprime uuid, p_valeurs jsonb)
returns void language plpgsql security invoker set search_path = public as $$
declare
  champs constant text[] := array['prenom','nom','trigramme','email','email_2','telephone_e164','telephone_brut','intitule_poste',
    'localisation','disponibilite','disponible_le','disponibilite_maj_le','statut','notes','linkedin','tjm_salaire','experience','cv_lien'];
  avant jsonb; apres jsonb; k text; modifs jsonb := '{}';
begin
  if not est_admin() then raise exception 'Fusion réservée aux administrateurs.'; end if;
  if p_garde = p_supprime then raise exception 'Les deux fiches sont identiques.'; end if;
  select to_jsonb(c) into avant from consultants c where id = p_garde;
  if avant is null or not exists (select 1 from consultants where id = p_supprime) then raise exception 'Fiche introuvable.'; end if;

  -- L'email gardé peut venir de l'autre fiche : on le libère d'abord (un email n'appartient qu'à une fiche).
  update consultants set email = null where id = p_supprime and p_valeurs ? 'email';

  -- Valeurs choisies, champ par champ (les autres restent celles de la fiche gardée).
  update consultants c set
    prenom = case when p_valeurs ? 'prenom' then p_valeurs->>'prenom' else c.prenom end,
    nom = case when p_valeurs ? 'nom' then p_valeurs->>'nom' else c.nom end,
    trigramme = case when p_valeurs ? 'trigramme' then p_valeurs->>'trigramme' else c.trigramme end,
    email = case when p_valeurs ? 'email' then p_valeurs->>'email' else c.email end,
    email_2 = case when p_valeurs ? 'email_2' then p_valeurs->>'email_2' else c.email_2 end,
    telephone_e164 = case when p_valeurs ? 'telephone_e164' then p_valeurs->>'telephone_e164' else c.telephone_e164 end,
    telephone_brut = case when p_valeurs ? 'telephone_brut' then p_valeurs->>'telephone_brut' else c.telephone_brut end,
    intitule_poste = case when p_valeurs ? 'intitule_poste' then p_valeurs->>'intitule_poste' else c.intitule_poste end,
    localisation = case when p_valeurs ? 'localisation' then p_valeurs->>'localisation' else c.localisation end,
    disponibilite = case when p_valeurs ? 'disponibilite' then p_valeurs->>'disponibilite' else c.disponibilite end,
    disponible_le = case when p_valeurs ? 'disponible_le' then (p_valeurs->>'disponible_le')::date else c.disponible_le end,
    disponibilite_maj_le = case when p_valeurs ? 'disponibilite_maj_le' then (p_valeurs->>'disponibilite_maj_le')::timestamptz else c.disponibilite_maj_le end,
    statut = case when p_valeurs ? 'statut' then (p_valeurs->>'statut')::statut_consultant else c.statut end,
    notes = case when p_valeurs ? 'notes' then p_valeurs->>'notes' else c.notes end,
    linkedin = case when p_valeurs ? 'linkedin' then p_valeurs->>'linkedin' else c.linkedin end,
    tjm_salaire = case when p_valeurs ? 'tjm_salaire' then p_valeurs->>'tjm_salaire' else c.tjm_salaire end,
    experience = case when p_valeurs ? 'experience' then p_valeurs->>'experience' else c.experience end,
    cv_lien = case when p_valeurs ? 'cv_lien' then p_valeurs->>'cv_lien' else c.cv_lien end,
    donnees_excel = coalesce(c.donnees_excel, '[]'::jsonb) || coalesce((select s.donnees_excel from consultants s where s.id = p_supprime), '[]'::jsonb)
  where c.id = p_garde;

  -- Tout ce qui appartenait à la fiche supprimée passe sur la fiche gardée (sans créer de doublon).
  update documents set consultant_id = p_garde where consultant_id = p_supprime;
  update tableau_lignes set consultant_id = p_garde where consultant_id = p_supprime;
  update alertes set consultant_id = p_garde where consultant_id = p_supprime and type <> 'doublon_possible';
  update emails_entrants set consultant_id = p_garde where consultant_id = p_supprime;
  update consultants_historique set consultant_id = p_garde where consultant_id = p_supprime;
  insert into consultant_competences (consultant_id, competence_id, niveau, annees)
    select p_garde, competence_id, niveau, annees from consultant_competences where consultant_id = p_supprime
    on conflict (consultant_id, competence_id) do nothing;
  update propositions p set consultant_id = p_garde where consultant_id = p_supprime
    and not exists (select 1 from propositions q where q.consultant_id = p_garde and q.mission_id = p.mission_id);
  update envois_relance e set consultant_id = p_garde where consultant_id = p_supprime
    and not exists (select 1 from envois_relance f where f.consultant_id = p_garde and f.campagne_id = e.campagne_id);
  update profils set consultant_id = p_garde where consultant_id = p_supprime and not exists (select 1 from profils where consultant_id = p_garde);

  select to_jsonb(c) into apres from consultants c where id = p_garde;
  foreach k in array champs loop
    if avant->k is distinct from apres->k then modifs := modifs || jsonb_build_object(k, jsonb_build_object('avant', avant->k, 'apres', apres->k)); end if;
  end loop;
  insert into consultants_historique (consultant_id, source, modifications, par) values (p_garde, 'fusion', modifs || jsonb_build_object('fiche_fusionnee', p_supprime), auth.uid());
  update alertes set statut = 'resolue', resolue_par = auth.uid(), resolue_le = now()
    where type = 'doublon_possible' and statut = 'ouverte' and consultant_id in (p_garde, p_supprime);

  delete from consultants where id = p_supprime; -- suppression tracée automatiquement dans le journal d'accès
end $$;

revoke all on function fusionner_consultants(uuid, uuid, jsonb) from public, anon;
grant execute on function fusionner_consultants(uuid, uuid, jsonb) to authenticated;
