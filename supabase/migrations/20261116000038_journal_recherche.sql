-- Suivi de l'activité des recruteurs : chaque recherche (section « Recherche ») est notée dans le journal d'accès.
alter type action_journal add value if not exists 'recherche';
