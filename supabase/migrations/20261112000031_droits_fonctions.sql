-- Revue de sécurité : aucun appel possible sans être connecté (le contrôle interne suffisait, le droit est retiré par principe).
revoke all on function responsables_possibles() from anon;
revoke all on function missions_responsable_reserve_admin() from anon;
