-- Fiches créées hors Excel (emails, CV SharePoint) : valeurs des colonnes du tableau sans champ dédié sur la fiche
-- (ex. « SUIVI », colonnes personnalisées), pour qu'elles soient modifiables dans le tableau comme les autres lignes.
alter table consultants add column if not exists colonnes_tableau jsonb not null default '{}';
