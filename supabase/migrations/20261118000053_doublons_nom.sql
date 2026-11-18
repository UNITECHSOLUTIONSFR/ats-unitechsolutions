-- Création d'une fiche (18/11/2026) : fiches existantes au même prénom et nom (accents, majuscules et tirets ignorés),
-- pour prévenir avant de créer un doublon. Le prénom vide ne filtre pas.
create or replace function public.nom_simplifie(t text) returns text
language sql immutable set search_path = public as $$
  select regexp_replace(translate(lower(coalesce(t, '')), 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæ-''', 'aaaaaaceeeeiiiinooooouuuuyyoa  '), '\s+', ' ', 'g');
$$;
create or replace function public.fiches_meme_nom(p_prenom text, p_nom text)
returns table(id uuid, prenom text, nom text, intitule_poste text)
language sql stable security invoker set search_path = public as $$
  select c.id, c.prenom, c.nom, c.intitule_poste from consultants c
  where trim(nom_simplifie(c.nom)) = trim(nom_simplifie(p_nom))
    and (trim(coalesce(p_prenom, '')) = '' or trim(nom_simplifie(c.prenom)) = trim(nom_simplifie(p_prenom)))
  order by c.created_at limit 5;
$$;
revoke execute on function public.fiches_meme_nom(text, text) from public, anon;
grant execute on function public.fiches_meme_nom(text, text) to authenticated, service_role;
