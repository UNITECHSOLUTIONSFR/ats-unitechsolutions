-- Module Email : modèles réutilisables et campagnes de deux types
--  - « disponibilite » : les réponses sont lues et appliquées automatiquement à la disponibilité ;
--  - « libre » : les réponses sont seulement rattachées à la fiche.
create table if not exists modeles_email (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null,
  objet       text not null,
  corps       text not null,
  type        text not null default 'disponibilite' check (type in ('disponibilite', 'libre')),
  cree_par    uuid references utilisateurs (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table modeles_email enable row level security;
create policy modeles_email_lecture on modeles_email for select to authenticated using (est_utilisateur_actif());
create policy modeles_email_admin on modeles_email for all to authenticated using (est_admin()) with check (est_admin());
grant select, insert, update, delete on modeles_email to authenticated;
create trigger modeles_email_maj before update on modeles_email for each row execute function maj_updated_at();

alter table campagnes_relance add column if not exists type text not null default 'disponibilite' check (type in ('disponibilite', 'libre'));

insert into modeles_email (nom, objet, corps, type)
select 'Mise à jour de disponibilité', 'Unitech Solutions – Êtes-vous disponible ?',
'Bonjour {prenom},

Nous mettons à jour notre vivier de consultants et serions ravis de pouvoir vous proposer de nouvelles missions.

Pourriez-vous simplement répondre à cet email en nous indiquant votre disponibilité ?
Par exemple : « disponible immédiatement », « disponible à partir du 15 janvier » ou « en mission jusqu''en mars ».

Merci par avance,
L''équipe recrutement Unitech Solutions', 'disponibilite'
where not exists (select 1 from modeles_email);
