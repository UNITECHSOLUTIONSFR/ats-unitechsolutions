-- Missions lues depuis Trello (lecture seule) : la carte Trello fait foi pour l'intitulé, le statut et le recruteur.
-- Deux statuts en plus : « chez le client » (positionnement, qualification, soutenance) et « en pause » (hold).
alter type statut_mission add value if not exists 'chez_client';
alter type statut_mission add value if not exists 'en_pause';

alter table missions
  add column if not exists trello_carte_id text unique,   -- identifiant de la carte (ne change pas quand la carte change de colonne)
  add column if not exists trello_colonne text,           -- nom de la colonne Trello actuelle, affiché tel quel
  add column if not exists trello_recruteur text,         -- recruteur tiré de la colonne « Sourcing … »
  add column if not exists trello_url text,               -- lien vers la carte
  add column if not exists trello_empreinte text,         -- empreinte du texte lu (carte + pièce jointe) : relecture par l'IA seulement si elle change
  add column if not exists trello_lu_le timestamptz,
  add column if not exists tjm text;                      -- TJM de la carte : information interne, affichée en lecture seule, jamais utilisée pour classer ni envoyée
