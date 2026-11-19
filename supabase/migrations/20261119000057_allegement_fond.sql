-- Audit vitesse du 19/11/2026.
-- 1. « Qu'est-ce qui a changé en dernier ? » : lu toutes les 10 minutes sur ces tables ; sans index, la base relisait
--    tout (≈ 0,2 à 0,9 s par table). Avec un index, la réponse est immédiate.
create index if not exists consultants_updated_at_idx on public.consultants (updated_at desc);
create index if not exists profils_updated_at_idx on public.profils (updated_at desc);
create index if not exists consultant_competences_updated_at_idx on public.consultant_competences (updated_at desc);
create index if not exists documents_updated_at_idx on public.documents (updated_at desc);
create index if not exists tableau_lignes_updated_at_idx on public.tableau_lignes (updated_at desc);
