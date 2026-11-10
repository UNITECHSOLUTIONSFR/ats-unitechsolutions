-- Synchronisation ATS → Excel : date à laquelle une fiche créée hors Excel a été ajoutée au fichier de suivi.
alter table consultants add column if not exists ajoute_excel_le timestamptz;
