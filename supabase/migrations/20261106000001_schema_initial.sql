-- =====================================================================
-- ATS Unitech Solution — schéma initial
-- Toutes les tables ont created_at / updated_at et la Row Level Security.
-- La clé « service_role » (côté serveur uniquement) contourne la RLS :
-- elle sert aux imports et synchronisations automatiques.
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists vector;

-- ---------------------------------------------------------------------
-- Types énumérés (listes de valeurs autorisées)
-- ---------------------------------------------------------------------
create type role_utilisateur as enum ('admin', 'recruteur');
create type source_consultant as enum ('import_excel', 'sharepoint', 'email', 'manuel', 'api');
create type statut_consultant as enum ('candidat', 'consultant', 'en_mission', 'inactif');
create type type_document as enum ('word_nominatif', 'pdf_anonyme', 'autre');
create type statut_association as enum ('non_traite', 'associe_auto', 'associe_manuel', 'douteux', 'sans_correspondance');
create type seniorite as enum ('junior', 'confirme', 'senior', 'expert');
create type statut_mission as enum ('ouverte', 'pourvue', 'fermee');
create type statut_proposition as enum ('propose', 'appele', 'envoye_client', 'retenu', 'refuse');
create type statut_email as enum ('a_traiter', 'candidature_traitee', 'non_candidature', 'sans_piece_jointe', 'erreur');
create type type_alerte as enum ('doublon_possible', 'association_douteuse', 'telephone_invalide', 'cv_illisible', 'disponibilite_ancienne', 'autre');
create type statut_alerte as enum ('ouverte', 'resolue', 'ignoree');
create type action_journal as enum ('consultation', 'creation', 'modification', 'export', 'suppression');

-- ---------------------------------------------------------------------
-- Mise à jour automatique de updated_at
-- ---------------------------------------------------------------------
create or replace function maj_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Utilisateurs et rôles (liés à l'authentification Supabase)
-- ---------------------------------------------------------------------
create table utilisateurs (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  nom_affiche text,
  role        role_utilisateur not null default 'recruteur',
  actif       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Fonctions d'aide aux règles d'accès (security definer : lisent la table
-- utilisateurs sans être bloquées par sa propre RLS).
create or replace function est_utilisateur_actif() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from utilisateurs where id = auth.uid() and actif);
$$;

create or replace function est_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from utilisateurs where id = auth.uid() and actif and role = 'admin');
$$;

-- ---------------------------------------------------------------------
-- Consultants (source de vérité des fiches)
-- ---------------------------------------------------------------------
create table consultants (
  id                    uuid primary key default gen_random_uuid(),
  prenom                text not null,
  nom                   text not null,
  trigramme             text not null,          -- étiquette, jamais un identifiant
  email                 text,                   -- normalisé (minuscules, sans espaces)
  telephone_e164        text,                   -- ex. +33612345678
  telephone_brut        text,                   -- valeur d'origine si non normalisable
  intitule_poste        text,
  metier                text,                   -- dossier métier SharePoint
  disponibilite         text,                   -- texte libre (ex. « immédiate », « mars 2027 »)
  disponible_le         date,
  disponibilite_maj_le  timestamptz,
  localisation          text,
  source                source_consultant not null default 'manuel',
  statut                statut_consultant not null default 'candidat',
  notes                 text,
  dernier_contact_le    timestamptz,            -- sert à la purge RGPD (24 mois)
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  recherche tsvector generated always as (
    to_tsvector('simple',
      coalesce(prenom, '') || ' ' || coalesce(nom, '') || ' ' || coalesce(trigramme, '') || ' ' ||
      coalesce(email, '') || ' ' || coalesce(intitule_poste, '') || ' ' || coalesce(metier, '') || ' ' ||
      coalesce(localisation, ''))
  ) stored
);
create unique index consultants_email_unique on consultants (email) where email is not null;
create index consultants_telephone_idx on consultants (telephone_e164);
create index consultants_trigramme_idx on consultants (trigramme);
create index consultants_recherche_idx on consultants using gin (recherche);

-- Historique des modifications d'une fiche (doublons fusionnés, mises à jour)
create table consultants_historique (
  id             uuid primary key default gen_random_uuid(),
  consultant_id  uuid not null references consultants (id) on delete cascade,
  source         text not null,                 -- ex. 'import_excel', 'interface', 'sharepoint'
  modifications  jsonb not null default '{}',   -- { champ: { avant, apres } }
  par            uuid references utilisateurs (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index consultants_historique_consultant_idx on consultants_historique (consultant_id);

-- ---------------------------------------------------------------------
-- Documents (fichiers SharePoint : on stocke la référence, jamais le fichier)
-- ---------------------------------------------------------------------
create table documents (
  id                     uuid primary key default gen_random_uuid(),
  consultant_id          uuid references consultants (id) on delete set null,
  type                   type_document not null,
  sharepoint_drive_id    text not null,
  sharepoint_item_id     text not null,
  chemin                 text,
  url_web                text,
  nom_fichier            text not null,
  metier_dossier         text,
  empreinte_sha256       text,
  texte_extrait          text,
  texte_extractible      boolean,
  modifie_sharepoint_le  timestamptz,
  statut_association     statut_association not null default 'non_traite',
  document_associe_id    uuid references documents (id) on delete set null, -- Word <-> PDF
  supprime_sharepoint    boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (sharepoint_drive_id, sharepoint_item_id)
);
create index documents_consultant_idx on documents (consultant_id);
create index documents_texte_idx on documents using gin (to_tsvector('french', coalesce(texte_extrait, '')));

-- ---------------------------------------------------------------------
-- Référentiel de compétences (avec synonymes)
-- ---------------------------------------------------------------------
create table competences (
  id                    uuid primary key default gen_random_uuid(),
  nom_canonique         text not null unique,
  synonymes             text[] not null default '{}',   -- formes normalisées (minuscules)
  categorie             text,
  creee_automatiquement boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index competences_synonymes_idx on competences using gin (synonymes);

-- ---------------------------------------------------------------------
-- Profils structurés par l'IA (un par consultant)
-- ---------------------------------------------------------------------
create table profils (
  id                  uuid primary key default gen_random_uuid(),
  consultant_id       uuid not null unique references consultants (id) on delete cascade,
  document_id         uuid references documents (id) on delete set null,
  annees_experience   numeric(4,1),
  seniorite           seniorite,
  secteurs            text[] not null default '{}',
  langues             jsonb not null default '[]',    -- [{ langue, niveau }]
  certifications      text[] not null default '{}',
  resume              text,
  embedding           vector(384),                     -- proximité sémantique (modèle gratuit)
  modele              text,
  prompt_version      text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table consultant_competences (
  consultant_id  uuid not null references consultants (id) on delete cascade,
  competence_id  uuid not null references competences (id) on delete cascade,
  niveau         smallint check (niveau between 1 and 5),
  annees         numeric(4,1),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (consultant_id, competence_id)
);
create index consultant_competences_competence_idx on consultant_competences (competence_id);

-- ---------------------------------------------------------------------
-- Missions et exigences
-- ---------------------------------------------------------------------
create table missions (
  id              uuid primary key default gen_random_uuid(),
  client          text,
  intitule        text not null,
  texte_besoin    text not null,
  exigences       jsonb not null default '{}',   -- extraction brute de l'IA
  localisation    text,
  date_debut      date,
  annees_min      numeric(4,1),
  seniorite       seniorite,
  statut          statut_mission not null default 'ouverte',
  embedding       vector(384),
  modele          text,
  prompt_version  text,
  cree_par        uuid references utilisateurs (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table mission_competences (
  mission_id     uuid not null references missions (id) on delete cascade,
  competence_id  uuid not null references competences (id) on delete cascade,
  obligatoire    boolean not null default false,
  importance     smallint not null default 2 check (importance between 1 and 3),
  annees_min     numeric(4,1),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (mission_id, competence_id)
);

-- ---------------------------------------------------------------------
-- Propositions (consultant positionné sur une mission) et leur historique
-- ---------------------------------------------------------------------
create table propositions (
  id             uuid primary key default gen_random_uuid(),
  mission_id     uuid not null references missions (id) on delete cascade,
  consultant_id  uuid not null references consultants (id) on delete cascade,
  score          numeric(5,2),
  detail_score   jsonb not null default '{}',
  statut         statut_proposition not null default 'propose',
  commentaire    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (mission_id, consultant_id)
);

create table propositions_historique (
  id              uuid primary key default gen_random_uuid(),
  proposition_id  uuid not null references propositions (id) on delete cascade,
  ancien_statut   statut_proposition,
  nouveau_statut  statut_proposition not null,
  par             uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create or replace function historiser_proposition() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.statut is distinct from old.statut then
    insert into propositions_historique (proposition_id, ancien_statut, nouveau_statut, par)
    values (new.id, case when tg_op = 'UPDATE' then old.statut end, new.statut, auth.uid());
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Emails entrants (phase 2 ; la table existe dès maintenant)
-- ---------------------------------------------------------------------
create table emails_entrants (
  id             uuid primary key default gen_random_uuid(),
  message_id     text not null unique,
  expediteur     text,
  recu_le        timestamptz,
  objet          text,
  statut         statut_email not null default 'a_traiter',
  consultant_id  uuid references consultants (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Alertes (cas à vérifier à la main)
-- ---------------------------------------------------------------------
create table alertes (
  id             uuid primary key default gen_random_uuid(),
  type           type_alerte not null,
  consultant_id  uuid references consultants (id) on delete cascade,
  document_id    uuid references documents (id) on delete cascade,
  details        jsonb not null default '{}',
  statut         statut_alerte not null default 'ouverte',
  resolue_par    uuid references utilisateurs (id) on delete set null,
  resolue_le     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index alertes_statut_idx on alertes (statut, type);

-- ---------------------------------------------------------------------
-- Journal des traitements automatiques (imports, synchronisations)
-- ---------------------------------------------------------------------
create table executions (
  id                uuid primary key default gen_random_uuid(),
  type              text not null,        -- 'import_excel', 'import_cv', 'synchro_nuit', ...
  debut             timestamptz not null default now(),
  fin               timestamptz,
  statut            text not null default 'en_cours',
  elements_traites  integer not null default 0,
  erreurs           integer not null default 0,
  rapport           jsonb not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Suivi des coûts d'IA
-- ---------------------------------------------------------------------
create table ai_usage (
  id                     uuid primary key default gen_random_uuid(),
  usage                  text not null,   -- 'fiche_cv', 'mission', 'tri_email', 'analyse_approfondie'
  modele                 text not null,
  mode                   text not null default 'standard',   -- 'standard' ou 'batch'
  tokens_entree          integer not null default 0,
  tokens_sortie          integer not null default 0,
  tokens_cache_lecture   integer not null default 0,
  tokens_cache_ecriture  integer not null default 0,
  cout_estime_usd        numeric(12,6) not null default 0,
  reference              text,           -- ex. identifiant du document ou de la mission
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index ai_usage_date_idx on ai_usage (created_at);

-- ---------------------------------------------------------------------
-- Journal d'accès (consultations, modifications, exports, suppressions)
-- ---------------------------------------------------------------------
create table journal_acces (
  id              uuid primary key default gen_random_uuid(),
  utilisateur_id  uuid,                  -- pas de clé étrangère : le journal survit aux suppressions
  action          action_journal not null,
  consultant_id   uuid,
  details         jsonb not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index journal_acces_consultant_idx on journal_acces (consultant_id);

-- Toute suppression de consultant est tracée automatiquement
create or replace function tracer_suppression_consultant() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into journal_acces (utilisateur_id, action, consultant_id, details)
  values (auth.uid(), 'suppression', old.id,
          jsonb_build_object('prenom', old.prenom, 'nom', old.nom, 'trigramme', old.trigramme));
  return old;
end $$;

-- ---------------------------------------------------------------------
-- Réglages (pondérations du score, plafond IA, seuils)
-- ---------------------------------------------------------------------
create table reglages (
  cle         text primary key,
  valeur      jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

insert into reglages (cle, valeur) values
  ('ponderations_score', '{"competences": 45, "annees": 15, "seniorite": 10, "disponibilite": 10, "semantique": 20}'),
  ('plafond_ia_mensuel_usd', '25'),
  ('seuil_alerte_nouvelle_fiche', '70'),
  ('seuil_association_word_pdf', '0.35'),
  ('disponibilite_ancienne_jours', '90'),
  ('purge_mois_sans_contact', '24');

-- ---------------------------------------------------------------------
-- Déclencheurs
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['utilisateurs','consultants','consultants_historique','documents','competences',
    'profils','consultant_competences','missions','mission_competences','propositions',
    'propositions_historique','emails_entrants','alertes','executions','ai_usage','journal_acces','reglages']
  loop
    execute format('create trigger %I before update on %I for each row execute function maj_updated_at()',
                   t || '_maj_updated_at', t);
  end loop;
end $$;

create trigger propositions_historique_trg after insert or update on propositions
  for each row execute function historiser_proposition();
create trigger consultants_suppression_trg before delete on consultants
  for each row execute function tracer_suppression_consultant();

-- =====================================================================
-- Row Level Security : activée sur TOUTES les tables, sans exception.
-- Personne n'accède sans être un utilisateur actif invité.
-- =====================================================================
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Le rôle « anon » (visiteur non connecté) n'a accès à rien.
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function est_utilisateur_actif(), est_admin() to authenticated;

-- Utilisateurs : chacun voit sa propre fiche ; l'admin gère tout.
create policy utilisateurs_lecture on utilisateurs for select to authenticated
  using (id = auth.uid() or est_admin());
create policy utilisateurs_admin_ecriture on utilisateurs for insert to authenticated with check (est_admin());
create policy utilisateurs_admin_maj on utilisateurs for update to authenticated using (est_admin()) with check (est_admin());
create policy utilisateurs_admin_suppr on utilisateurs for delete to authenticated using (est_admin());

-- Tables métier : lecture / création / modification pour tout utilisateur actif,
-- suppression réservée aux administrateurs.
do $$
declare t text;
begin
  foreach t in array array['consultants','consultants_historique','documents','competences','profils',
    'consultant_competences','missions','mission_competences','propositions','alertes']
  loop
    execute format('create policy %I on %I for select to authenticated using (est_utilisateur_actif())', t || '_lecture', t);
    execute format('create policy %I on %I for insert to authenticated with check (est_utilisateur_actif())', t || '_creation', t);
    execute format('create policy %I on %I for update to authenticated using (est_utilisateur_actif()) with check (est_utilisateur_actif())', t || '_modification', t);
    execute format('create policy %I on %I for delete to authenticated using (est_admin())', t || '_suppression', t);
  end loop;
end $$;

-- Les exigences d'une mission peuvent être retirées par tout utilisateur actif (ajustement du besoin).
create policy mission_competences_retrait on mission_competences for delete to authenticated
  using (est_utilisateur_actif());

-- Historique des propositions : lecture seule (écrit par le déclencheur).
create policy propositions_historique_lecture on propositions_historique for select to authenticated
  using (est_utilisateur_actif());

-- Traitements automatiques : lecture par les utilisateurs actifs, écriture par le serveur uniquement.
create policy executions_lecture on executions for select to authenticated using (est_utilisateur_actif());
create policy emails_entrants_lecture on emails_entrants for select to authenticated using (est_utilisateur_actif());

-- Coûts IA : visibles par les administrateurs seulement.
create policy ai_usage_lecture on ai_usage for select to authenticated using (est_admin());

-- Journal d'accès : chacun écrit ses propres lignes ; seuls les admins le lisent.
create policy journal_acces_ecriture on journal_acces for insert to authenticated
  with check (est_utilisateur_actif() and utilisateur_id = auth.uid());
create policy journal_acces_lecture on journal_acces for select to authenticated using (est_admin());

-- Réglages : lus par tous les utilisateurs actifs, modifiés par les admins.
create policy reglages_lecture on reglages for select to authenticated using (est_utilisateur_actif());
create policy reglages_admin_maj on reglages for update to authenticated using (est_admin()) with check (est_admin());
create policy reglages_admin_creation on reglages for insert to authenticated with check (est_admin());
