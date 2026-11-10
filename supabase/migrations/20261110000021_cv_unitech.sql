-- CV Unitech générés automatiquement pour les candidatures email : date de génération (une seule fois par fiche).
alter table consultants add column if not exists cv_unitech_le timestamptz;
-- Dépôt dans les dossiers métier SharePoint : coupé tant que le rendu n'est pas validé (essais dans « Sauvegardes ATS/Essais CV Unitech »).
insert into reglages (cle, valeur) values ('cv_unitech_depot_metier', 'false') on conflict (cle) do nothing;
