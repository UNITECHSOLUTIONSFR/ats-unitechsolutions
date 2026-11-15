-- Vitesse : les règles d'accès (RLS) appelaient est_utilisateur_actif(), est_admin() et auth.uid() pour CHAQUE ligne lue
-- (≈ 1 s pour 30 000 lignes au lieu de 20 ms). Écrites « (select …) », elles sont évaluées une seule fois par requête.
-- Les règles restent strictement les mêmes : seule l'écriture change (recommandation Supabase).
do $$
declare
  p record;
  motif constant text := '(?<!select )\m(est_utilisateur_actif|est_admin|auth\.uid)\(\)';
  q text;
  w text;
begin
  for p in select schemaname, tablename, policyname, qual, with_check from pg_policies where schemaname = 'public' loop
    q := regexp_replace(p.qual, motif, '(select \1())', 'g');
    w := regexp_replace(p.with_check, motif, '(select \1())', 'g');
    if q is distinct from p.qual then
      execute format('alter policy %I on %I.%I using (%s)', p.policyname, p.schemaname, p.tablename, q);
    end if;
    if w is distinct from p.with_check then
      execute format('alter policy %I on %I.%I with check (%s)', p.policyname, p.schemaname, p.tablename, w);
    end if;
  end loop;
end $$;
