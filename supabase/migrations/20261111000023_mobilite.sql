-- Mobilité géographique saisie à la main par l'équipe (« Paris », « Île-de-France », « France », « Monde entier »…).
alter table consultants add column if not exists mobilite text;
comment on column consultants.mobilite is 'Mobilité géographique, saisie manuellement (texte libre avec suggestions).';
