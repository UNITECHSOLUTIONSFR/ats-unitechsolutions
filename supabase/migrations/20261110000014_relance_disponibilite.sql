-- Relance des disponibilités par email (fonctionnalité préparée, NON APPLIQUÉE en production tant qu'elle n'est pas validée).
-- Une campagne = un envoi groupé ; un envoi = un email à un consultant, suivi jusqu'à sa réponse.

alter table consultants add column if not exists ne_plus_contacter boolean not null default false;  -- désinscription (RGPD)
alter table consultants add column if not exists desinscrit_le timestamptz;
-- Cellules à recopier dans le fichier Excel à la prochaine synchronisation (l'Excel fait foi pendant la transition) :
-- { "disponibilite": "Disponible le 15/01/2027" }
alter table consultants add column if not exists excel_maj_en_attente jsonb;

create table if not exists campagnes_relance (
  id                uuid primary key default gen_random_uuid(),
  objet             text not null,
  corps             text not null,
  filtre            jsonb not null default '{}',
  statut            text not null default 'preparee' check (statut in ('preparee', 'en_cours', 'terminee', 'annulee')),
  nb_destinataires  integer not null default 0,
  cree_par          uuid references utilisateurs (id) on delete set null,
  lancee_le         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists envois_relance (
  id                  uuid primary key default gen_random_uuid(),
  campagne_id         uuid not null references campagnes_relance (id) on delete cascade,
  consultant_id       uuid not null references consultants (id) on delete cascade,
  email               text not null,
  statut              text not null default 'a_envoyer'
                        check (statut in ('a_envoyer', 'envoye', 'erreur', 'repondu', 'a_verifier', 'desinscrit')),
  jeton_desinscription uuid not null default gen_random_uuid() unique,
  message_id          text,          -- identifiant Graph du message envoyé
  internet_message_id text,          -- en-tête Message-ID (la réponse le cite dans In-Reply-To)
  conversation_id     text,          -- fil Outlook : la réponse arrive dans le même fil
  envoye_le           timestamptz,
  repondu_le          timestamptz,
  reponse             jsonb,         -- lecture de la réponse par l'IA (jamais le texte complet de l'email)
  erreur              text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (campagne_id, consultant_id)
);
create index if not exists envois_relance_statut_idx on envois_relance (statut);
create index if not exists envois_relance_conversation_idx on envois_relance (conversation_id);
create index if not exists envois_relance_consultant_idx on envois_relance (consultant_id);

alter table campagnes_relance enable row level security;
alter table envois_relance enable row level security;
-- Lecture par toute personne invitée (suivi sur la fiche) ; préparation et envoi réservés aux administrateurs.
create policy campagnes_relance_lecture on campagnes_relance for select to authenticated using (est_utilisateur_actif());
create policy campagnes_relance_admin on campagnes_relance for all to authenticated using (est_admin()) with check (est_admin());
create policy envois_relance_lecture on envois_relance for select to authenticated using (est_utilisateur_actif());
create policy envois_relance_admin on envois_relance for all to authenticated using (est_admin()) with check (est_admin());

create trigger campagnes_relance_maj before update on campagnes_relance for each row execute function maj_updated_at();
create trigger envois_relance_maj before update on envois_relance for each row execute function maj_updated_at();
grant select, insert, update, delete on campagnes_relance, envois_relance to authenticated;
