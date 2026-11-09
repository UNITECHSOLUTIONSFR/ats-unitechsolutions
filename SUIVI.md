# SUIVI.md — Avancement du projet ATS Unitech Solution

Dernière mise à jour : 9 novembre 2026

## Où on en est
**Étape 0 — Cadrage** terminée : brief enregistré (`BRIEF.md`), règles du projet (`CLAUDE.md`), guide de préparation (`GUIDE_PREPARATION.md`).
**En attente** : que tu suives `GUIDE_PREPARATION.md` (parties 1 à 5). Les trois questions ont reçu leur réponse ; la partie 3 du guide a été réécrite en pas-à-pas d'administration Microsoft 365. Ensuite je démarre l'étape 1.

## Plan des 13 étapes

| # | Étape | Statut | Jalon |
|---|---|---|---|
| 0 | Cadrage (brief, règles, guide de préparation) | ✅ Terminé | |
| 1 | Préparation des comptes (vérification du guide) | 🔄 En cours | |
| 2 | Squelette en ligne (Next.js + connexion + Vercel) | 🟡 Code prêt et testé ; mise en ligne dès que Vercel et Supabase sont prêts | |
| 3 | Base de données (schéma, RLS, rôles, référentiel) | 🟡 Schéma écrit et testé sur base temporaire ; à créer dans Supabase | |
| 4 | Import du fichier Excel de suivi | 🟡 Lecture + rapport prêts et testés ; attend la copie .xlsx | |
| 5 | Connexion SharePoint + association Word-PDF sur 20 consultants | ⬜ À faire | **Jalon A** |
| 6 | Structuration IA : comparatif Haiku / Sonnet + estimation | 🟡 Module IA prêt (sans appel réel) | **Jalon B** |
| 7 | Import complet des ~2 000 CV (Batch API) | ⬜ À faire | |
| 8 | Interface principale + administration + export Excel | 🟡 Tableau de bord, liste/recherche et fiche consultant prêts ; administration et export à faire | |
| 9 | Matching des missions + suivi des propositions | 🟡 Écrans prêts (saisie, exigences ajustables, classement, suivi) ; test réel dès que Supabase est prêt | **Jalon C** |
| 10 | Synchronisation nocturne + rapport du matin | ⬜ À faire | |
| 12 | Sécurité et RGPD (revue complète) | ⬜ À faire | **Jalon D** |
| 13 | Mise en service (guides, restauration, invitation) | ⬜ À faire | |
| 11 → Phase 2 | Candidatures par email (`recrutement@`) — **reportée après la mise en service de la V1** | ⏸ Phase 2 | |

## Changement de périmètre (6 novembre 2026, à la demande de l'utilisatrice)
- **V1** = import du fichier Excel et des CV SharePoint, synchronisation de nuit, saisie manuelle d'une mission et matching avec les CV existants, interface, sécurité, mise en service.
- **Phase 2** = liaison automatique avec `recrutement@unitechsolutions.fr` (ancienne étape 11).
- Conséquences : l'application Microsoft n'a besoin que de la **lecture** sur SharePoint en V1 (droit d'écriture ajouté en phase 2) ; aucun réglage Exchange/PowerShell en V1 ; le code garde une fonction d'ingestion unique pour accueillir les emails ensuite.

## Journal des étapes
### Étape 0 — Cadrage (6 novembre 2026)
- **Fait** : BRIEF.md, CLAUDE.md, SUIVI.md, GUIDE_PREPARATION.md ; tarifs et identifiants des modèles vérifiés dans la documentation officielle Anthropic.
- **Testé** : rien à tester (aucun code).
- **Ensuite** : tu suis le guide de préparation ; je vérifie chaque point puis je démarre l'étape 1.

### Étape 1 — Préparation des comptes (en cours)
- **Fait** : accès réseau de la session ouvert à 5 services (Anthropic, Supabase, Microsoft Graph, connexion Microsoft, Vercel).
- **Testé** : les 5 services répondent depuis la session (refus « sans clé » attendu pour Anthropic, Supabase et Vercel).
- **Reste** : les parties 1, 2, 3, 4 et 5 du guide par l'utilisatrice, puis vérification de chaque clé et de chaque compte.

### Construction anticipée (6 novembre 2026, sans attendre les comptes)
- **Fait** : application Next.js (connexion par lien magique, accueil protégé) ; schéma de base (17 tables, RLS partout, rôles, historique, journal) et référentiel de 97 compétences ; règles métier (téléphones, trigrammes, doublons) ; lecture du fichier Excel avec rapport ; module IA unique (`src/lib/ai`) ; calcul du score de matching explicable.
- **Testé** : 70 tests automatiques, dont les règles d'accès sur une base Postgres temporaire ; compilation et pages vérifiées dans un navigateur.
- **Ensuite** : écrans consultants et missions ; dès que les comptes sont prêts, mise en ligne, création de la base réelle, import Excel.

### Écrans (6 novembre 2026)
- **Fait** : tableau de bord ; consultants (recherche, fiche modifiable avec historique et journal, liens SharePoint, alerte disponibilité > 3 mois) ; missions (saisie du besoin, extraction IA, exigences ajustables, classement explicable, suivi des propositions, statut de mission).
- **Testé** : 72 tests (dont la sélection des candidats et la recherche sur base temporaire avec RLS) ; compilation et affichage des pages sans base. Test de bout en bout impossible avant la création de Supabase (pas de Docker dans la session).
- **Ensuite** : administration (utilisateurs, coûts, pondérations, export Excel) ; mise en ligne dès que les comptes sont prêts.

### Mise en place réelle (9 novembre 2026)
- **Fait** : base créée dans Supabase (17 tables, RLS partout, 97 compétences), inscription libre fermée, adresses de connexion réglées sur le site Vercel, compte administrateur créé ; code publié sur `main` ; corrections Vercel (type Next.js, dossier de sortie).
- **Testé** : contrôle des tables et de la RLS directement dans Supabase ; construction Vercel réussie (erreur de dossier de sortie corrigée).
- **Ensuite** : liaison Supabase ↔ Vercel par l'utilisatrice, puis premier test de connexion en ligne.

### Tableau de suivi et nouvelle présentation (9 novembre 2026, demande de l'utilisatrice)
- **Fait** : page « Tableau de suivi » = copie fidèle de l'Excel (tous les onglets, mêmes en-têtes, même ordre, prénom et nom séparés) ; filtres par colonne façon Excel, tri, recherche, modification d'une cellule (double-clic) ou d'une colonne sur plusieurs lignes, copie des emails/téléphones, export Excel (admins) ; les modifications de l'onglet principal mettent à jour la fiche consultant (historique + journal). Nouvelle présentation : menu à gauche, couleurs de marque, tableau de bord refait. Tables `tableau_onglets` / `tableau_lignes` créées dans Supabase (RLS).
- **Testé** : 83 tests (dont RLS des nouvelles tables, lecture multi-onglets, filtres, tri, mise à jour des fiches) ; compilation ; écrans vérifiés dans un navigateur.
- **Ensuite** : l'utilisatrice réimporte son fichier Excel (Paramètres → Import) pour charger tous les onglets ; couleurs exactes d'Unitech à fournir.

## Réponses reçues (6 novembre 2026)
1. Boîte de candidatures : adresse existante **`recrutement@unitechsolutions.fr`** (type de boîte à relever en partie 3.1 du guide). L'utilisatrice **est l'administratrice Microsoft 365** → la partie 3 du guide est un pas-à-pas d'administration (plus de demande à un tiers).
2. CV SharePoint rangés **par métier** (un dossier par métier).
3. Connexion des équipes avec **leurs comptes Microsoft 365** : oui (coût supplémentaire : 0 €).

## Questions en attente (à toi)
Aucune pour l'instant. Prochaine action : suivre `GUIDE_PREPARATION.md` (parties 1 à 5) puis écrire « Guide suivi ».

## Décisions à confirmer (appliquées par défaut, non bloquantes)
| # | Décision recommandée | Pourquoi |
|---|---|---|
| D1 | **Tâches planifiées** : Vercel Cron (inclus dans Vercel Pro) pour la relève des emails (toutes les 15 min) et la synchronisation de nuit ; GitHub Actions déclenché à la main pour l'import initial. | Aucun coût en plus ; Vercel Pro limite une exécution à quelques minutes, suffisant pour des lots incrémentaux ; l'import initial (long) tourne jusqu'à 6 h dans GitHub Actions, gratuit pour ce volume. |
| D2 | **Import « de test » de l'étape 4** dans une base Postgres temporaire de la session, puis dans un schéma séparé du projet Supabase, plutôt qu'un 2e projet Supabase. | Un 2e projet Supabase Pro coûte environ 10 $/mois de plus. |
| D3 | **Réponse automatique** de la boîte de candidatures faite par Exchange (réponses automatiques de la boîte partagée), pas par l'application. | Évite de donner à l'application le droit d'envoyer des emails (`Mail.Send`) ; plus simple et plus sûr. |
| D4 | **Vecteurs sémantiques** : modèle multilingue gratuit (ex. `multilingual-e5-small`) plutôt que `gte-small` (surtout anglais) si le test montre un écart ; poids sémantique modeste dans le score. | Les CV sont en français. À trancher sur l'échantillon, sans coût. |
| D5 | **Pas de rôle « lecture seule »** en V1. | Ajout facile plus tard si besoin. |
| D6 | **Trigramme** : prendre le trigramme déjà présent dans l'Excel quand il existe ; pour les nouveaux, règle proposée : accents retirés, tirets/apostrophes/espaces supprimés ; particules « de, du, des, d' » ignorées si un autre mot suit ; « Le / La » conservés (partie du nom). Exemples : Le Goff → **LE** (JLE), De La Tour → **LA** (xLA), Jean-Marc Dupont → **JDU**, Éloïse Gérard → **EGE**, D'Artagnan → **AR**. | À valider sur les trigrammes réels de l'Excel à l'étape 4 (je mesurerai le % de concordance). |
| D7 | **Accès Microsoft à la boîte** : `Mail.Read` seul (lecture), via le contrôle d'accès Exchange « RBAC for Applications » limité à la boîte. | Moindre privilège ; l'état « traité » est gardé dans la base. |
| D9 | **Dépôt des CV reçus par email** : dans le dossier métier correspondant au poste détecté, sinon dans un dossier `À classer`. | Respecte le rangement actuel par métier ; l'outil suit le fichier s'il est déplacé ensuite. |
| D10 | **Connexion réservée au groupe « ATS – Utilisateurs »** dans Entra ID ; si l'option groupe n'est pas incluse dans l'abonnement, affectation personne par personne (pas d'option payante). | Retrait d'accès en un clic côté Microsoft, sans surcoût. |
| D11 | **Historique de `recrutement@`** : seuls les emails reçus après la mise en service de la phase 2 sont traités ; l'historique pourra l'être ensuite, après estimation. | Évite un traitement de masse non estimé ; les anciens CV sont déjà dans SharePoint. |
| D12 | **Connexion par lien magique** au démarrage (inscription libre désactivée : seuls les invités reçoivent le lien) ; pas de filtre sur le nom de domaine pour l'instant (décision de l'utilisatrice). Connexion Microsoft ajoutable plus tard. | Démarrer sans les réglages Entra 3.1 et 3.4. |
| D13 | **Supabase reste à Londres** (`eu-west-2`) au lieu de Paris : la région ne peut pas être changée sans recréer le projet ; le Royaume-Uni bénéficie d'une décision d'adéquation RGPD. À mentionner dans le registre des traitements. | Décidé par l'utilisatrice le 9/11/2026. |
| D14 | **Tableau de suivi** : seul le 1er onglet crée/alimente les fiches consultants ; les autres onglets sont recopiés tels quels. Réimporter le fichier **remplace** le tableau (pas les fiches). | À confirmer selon le contenu des autres onglets. |
| D15 | **Couleurs** : bleu provisoire, modifiable en un seul endroit (`src/app/globals.css`, famille « marque »). | En attente des codes couleur / logo d'Unitech. |
| D16 | **Traitements en masse** : modifier une colonne, copier emails/téléphones, exporter la sélection (export réservé aux admins, règle du brief). | Autres traitements à préciser par l'utilisatrice. |
| D8 | **Haiku et Sonnet 5.5** : thinking désactivé ou `effort: low` pour les extractions. | La réflexion est facturée comme sortie ; inutile pour de l'extraction. |

## Coûts IA réels
| Date | Traitement | Coût réel |
|---|---|---|
| — | — | 0 $ |
