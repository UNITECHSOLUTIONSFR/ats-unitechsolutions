-- Rien n'est perdu de l'Excel de suivi : colonnes utiles en champs, et chaque ligne d'origine conservée telle quelle.
alter table consultants
  add column if not exists experience    text,
  add column if not exists tjm_salaire   text,
  add column if not exists linkedin      text,
  add column if not exists cv_lien       text,
  add column if not exists donnees_excel jsonb not null default '[]'; -- [{ ligne, valeurs: { colonne: valeur } }]
