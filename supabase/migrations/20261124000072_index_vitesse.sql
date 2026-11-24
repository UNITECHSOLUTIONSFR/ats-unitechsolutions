-- Vitesse (nuit du 24 au 25/11/2026) : index pour des lectures fréquentes qui parcouraient toute la table.
-- Aucun changement de fonctionnement ni d'écran.
create index if not exists ai_usage_created_at on public.ai_usage (created_at desc);                    -- dépense du jour / du mois (à chaque appel IA)
create index if not exists documents_item on public.documents (sharepoint_item_id);                      -- CV retrouvé par son identifiant (Collective, synchro)
create index if not exists imports_collective_statut on public.imports_collective (statut, created_at);  -- file des CV Collective
create index if not exists imports_collective_consultant on public.imports_collective (consultant_id);   -- découpage, onglet Collective
create index if not exists imports_collective_created on public.imports_collective (created_at desc);    -- onglet Collective (plus récents d'abord)
create index if not exists journal_acces_utilisateur on public.journal_acces (utilisateur_id, action, created_at desc); -- anti-doublon des consultations / créations
create index if not exists consultants_email_2 on public.consultants (email_2) where email_2 is not null; -- dédoublonnage par second email
