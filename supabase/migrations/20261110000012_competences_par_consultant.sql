-- Compétences de chaque consultant en une ligne (recherche « Java Paris » dans l'écran Consultants).
-- security_invoker : la vue applique les règles d'accès (RLS) de la personne connectée.
create or replace view competences_par_consultant with (security_invoker = true) as
select cc.consultant_id, string_agg(c.nom_canonique, ' · ' order by c.nom_canonique) as competences
from consultant_competences cc
join competences c on c.id = cc.competence_id
group by cc.consultant_id;

grant select on competences_par_consultant to authenticated;
