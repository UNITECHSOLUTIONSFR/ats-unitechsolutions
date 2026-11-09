-- Étape 5 : traçabilité de l'association Word ↔ PDF (méthode, similarité, candidats examinés).
alter table documents
  add column if not exists association_methode    text,
  add column if not exists association_similarite real,
  add column if not exists association_details    jsonb not null default '{}';

-- Lien de synchronisation incrémentale (delta Microsoft Graph) conservé d'une nuit à l'autre.
create table if not exists sharepoint_etat (
  drive_id    text primary key,
  lien_delta  text,
  updated_at  timestamptz not null default now()
);
alter table sharepoint_etat enable row level security;
-- Aucune règle d'accès : table réservée aux traitements serveur (clé secrète), invisible des utilisateurs.
