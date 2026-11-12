-- CV Unitech : le Word est généré seul ; le PDF est produit ensuite à partir du Word tel qu'il est dans SharePoint
-- (corrections de l'équipe comprises), à la demande ou chaque nuit si le Word a été modifié.
alter table cv_unitech_generes alter column pdf_nom drop not null;
alter table cv_unitech_generes alter column pdf_url drop not null;
alter table cv_unitech_generes add column if not exists drive_id text;
alter table cv_unitech_generes add column if not exists word_item_id text;
alter table cv_unitech_generes add column if not exists pdf_nom_prevu text;
alter table cv_unitech_generes add column if not exists pdf_genere_le timestamptz;
drop policy if exists cv_unitech_maj on cv_unitech_generes;
create policy cv_unitech_maj on cv_unitech_generes for update to authenticated using (est_utilisateur_actif()) with check (est_utilisateur_actif());
grant update on cv_unitech_generes to authenticated;
