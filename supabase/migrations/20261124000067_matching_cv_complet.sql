-- Nouveau matching du 24/11/2026 (décisions de l'utilisatrice) : chaque CV retenu est comparé EN ENTIER à la fiche de poste,
-- critère par critère ; une mission n'est lue qu'une fois ; un nouveau CV est comparé aux missions déjà lues.

-- Notes de la nouvelle lecture (CV complet, critère par critère), gardées à part des anciennes (résumé / complet).
alter table public.notes_v3 drop constraint if exists notes_v3_etape_check;
alter table public.notes_v3 add constraint notes_v3_etape_check check (etape in ('resume', 'complet', 'cv'));

-- Date jusqu'à laquelle les CV découpés ont déjà été comparés à la mission (les suivants sont des « nouveaux CV »).
alter table public.classements_mission add column if not exists cv_verifies_le timestamptz;
