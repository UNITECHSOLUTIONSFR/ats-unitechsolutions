-- Import : deuxième email, commentaire libre trouvé dans la case email, alerte « nom manquant ».
alter table consultants
  add column if not exists email_2           text,
  add column if not exists commentaire_email text;
alter type type_alerte add value if not exists 'nom_manquant';
