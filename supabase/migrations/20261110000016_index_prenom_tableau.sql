-- Affichage immédiat des 100 premières lignes de l'écran Consultants, triées par prénom.
create index if not exists tableau_lignes_prenom_idx on tableau_lignes (onglet_id, (valeurs->>'Prénoms'));
