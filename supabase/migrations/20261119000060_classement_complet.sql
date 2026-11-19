-- Classement complet d'une mission (19/11/2026) : tous les profils comparés, dans l'ordre, avec leur pourcentage,
-- comme sur les autres outils. Format : [[consultant_id, pourcentage, lu_par_ia (0/1)], …] (≈ 50 octets par profil).
alter table public.classements_mission add column if not exists ordre jsonb;
