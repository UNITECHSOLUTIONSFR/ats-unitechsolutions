-- Durcissement (revue de sécurité du 16/11/2026, avant l'ouverture aux équipes) :
-- 1. Visiteurs non connectés (anon) : plus aucun droit sur les tables et fonctions (les règles d'accès les bloquaient déjà ; défense en profondeur).
revoke all on all tables in schema public from anon;
revoke execute on function est_admin(), est_utilisateur_actif(), historiser_proposition(), missions_responsable_reserve_admin(), tracer_suppression_consultant() from anon, public;
-- 2. Fonctions de déclenchement (triggers) : jamais appelables directement, même connecté.
revoke execute on function historiser_proposition(), missions_responsable_reserve_admin(), tracer_suppression_consultant() from authenticated;
-- 3. Ancienne recherche par motifs, plus utilisée par l'application : réservée au serveur.
revoke execute on function consultants_par_motifs(text[]) from authenticated, anon, public;
-- 4. Chemin de recherche figé pour la fonction de date de mise à jour.
alter function maj_updated_at() set search_path = public;
-- 5. Index en double sur le tableau de suivi.
drop index if exists tableau_lignes_onglet_idx;
