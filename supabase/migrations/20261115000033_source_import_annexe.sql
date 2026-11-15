-- Import d'un fichier Excel annexe : son contenu s'ajoute à la base (rien n'est écrasé).
-- Les fiches qu'il crée ont leur propre origine, pour être ajoutées au fichier de suivi la nuit comme les autres fiches créées hors Excel.
alter type source_consultant add value if not exists 'import_annexe';
