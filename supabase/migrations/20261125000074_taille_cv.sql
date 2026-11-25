-- Limite de taille des CV levée (décision de l'utilisatrice, 25/11/2026) : l'espace privé de l'outil n'a plus de limite
-- propre (seule reste la limite générale du projet Supabase).
update storage.buckets set file_size_limit = null where id = 'cv-adequation';
