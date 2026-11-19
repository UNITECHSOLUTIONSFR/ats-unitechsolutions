-- Évaluation IA détaillée d'un profil pour une mission (19/11/2026) : récapitulatif du profil et analyse point par point
-- des exigences (atteint ou non, avec la preuve tirée du CV). Une seule note partout : celle de l'IA.
alter table public.avis_matching add column if not exists detail jsonb;
