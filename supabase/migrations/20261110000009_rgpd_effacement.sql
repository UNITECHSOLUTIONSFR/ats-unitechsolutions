-- Droit à l'effacement : un administrateur peut supprimer les emails reçus d'une personne (métadonnées).
create policy emails_entrants_admin_suppression on emails_entrants for delete to authenticated using (est_admin());
