-- Revue de sécurité du 17/11/2026 : les fonctions récentes n'étaient retirées qu'au rôle « anon », pas à « public »
-- (dont anon hérite). Elles ne lisaient rien sans connexion (règles des tables), mais le droit d'exécution est retiré.
do $$
declare f text;
begin
  foreach f in array array[
    'scores_consultant(uuid)', 'rang_dans_classement(uuid, numeric)', 'tableau_cle_date(text)', 'tableau_page(jsonb)',
    'tableau_valeurs(jsonb, text)', 'tableau_ids(jsonb)', 'tableau_lignes_retenues(jsonb)', 'profils_par_competence(uuid[])',
    'dernieres_executions()', 'cv_contenant(text)', 'cv_extraits(text, uuid[])'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  execute 'revoke all on function public.maj_updated_at() from public, anon, authenticated';
end $$;
