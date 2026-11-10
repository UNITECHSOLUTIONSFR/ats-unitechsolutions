# SUIVI.md — Avancement du projet ATS Unitech Solution

Dernière mise à jour : 9 novembre 2026

## Où on en est (10 novembre 2026)
Toutes les tâches réalisables sans action de l'utilisatrice sont **terminées et en ligne**. Restent en attente : les actions listées ci-dessous (« En attente de l'utilisatrice »).

## Plan des 13 étapes

| # | Étape | Statut | Jalon |
|---|---|---|---|
| 0 | Cadrage | ✅ Terminé | |
| 1 | Préparation des comptes | ✅ Terminé (GitHub, Vercel, Supabase Londres, Anthropic, Entra) | |
| 2 | Squelette en ligne | ✅ En ligne, connexion par lien magique | |
| 3 | Base de données | ✅ 18 tables, RLS partout, testée | |
| 4 | Import du fichier Excel | ✅ 3 897 fiches, tableau de suivi (vues par domaine), corrections emails, doublons supprimés | |
| 5 | Connexion SharePoint + association Word ↔ PDF | ✅ Lecture seule ; 501 associations puis synchro de nuit | Jalon A : **validé** (association par nom de fichier acceptée) |
| 6 | Structuration IA | ✅ Haiku 5.5 en lot ; 323 CV analysés pour 0,17 $ | Jalon B : **validé de fait** (Haiku retenu) |
| 7 | Analyse de tous les CV | ✅ Lancée ; le reste est repris chaque nuit | |
| 8 | Interface + administration + export Excel | ✅ Écran Consultants (panneau de fiche), CV SharePoint, cas à vérifier, coûts et réglages, synchronisations | |
| 9 | Matching des missions | ✅ En ligne | **Jalon C : en attente** (3 missions passées à fournir) |
| 10 | Synchronisations de nuit + rapport du matin | ✅ Excel (l'Excel fait foi), CV SharePoint, emails ; rapport sur l'accueil | |
| 11 | Candidatures par email | ✅ Boîte ATS Candidatures, relève horaire ; historique à copier | |
| 12 | Sécurité et RGPD | ✅ Export, effacement, purge 24 mois ; mention et registre rédigés (`RGPD.md`) | **Jalon D : en attente** de validation |
| 13 | Mise en service | 🟡 Guides prêts (`GUIDE_EXPLOITATION.md`, `GUIDE_UTILISATEUR.md`) ; reste : test de restauration, invitation de l'équipe | |

## Point du 10/11/2026 (refonte et vitesse)
- **Fait** : style « verre » sur tous les écrans, nouvelle page de connexion, accueil (missions ouvertes + 3 meilleurs profils, nouvelles fiches, cas à vérifier), fiche latérale (actions rapides, « Proposer sur une mission »), recherche par compétence (« java paris »), page Aide, message d'invitation (`INVITATION_EQUIPE.md`), largeurs de colonnes et bouton « + » d'actions. Vitesse : session vérifiée localement et une seule fois par page, lectures en parallèle, onglets Domaine sans rechargement, recherche indexée, écran de chargement immédiat.
- **Corrigé** : doublons de la synchro Excel (57 fusionnés, ligne déplacée/modifiée désormais reconnue) ; CV comptés « modifiés » à chaque synchro (format de date) ; logo invisible sur la page de connexion.
- **Reprise de l'historique** du groupe recrutement@ (3 mois, droit Group.Read.All temporaire) : en cours. **Ensuite : retirer Group.Read.All dans Entra.**
- **À rappeler plus tard** : dépôt dans SharePoint (dossier métier) des CV reçus par email (nécessite l'accord pour écrire dans SharePoint).
- **Proposés, pas encore lancés** : tri des alertes, relance automatique des synchronisations (planificateur externe), test de l'écran avec un compte recruteur.

- **Responsable de mission** (en ligne) : colonne `missions.responsable_id`, assignation réservée aux admins (vérifiée aussi par la base), « Mes missions » par défaut (miennes + à assigner) dans Missions et sur le tableau de bord, filtre « Toutes les missions ». Décision (10/11) : une nouvelle mission est donnée d'office à la personne qui la crée.

- **Vitesse (10/11)** : classement d'une mission 15× plus rapide (1,5 s → 0,1 s, migration 15 appliquée), tableau de bord affiché sans attendre les classements, écrans déjà vus réaffichés immédiatement (2 min), fiche servie par une lecture directe et préchargée au survol.
- **Module Email** (menu « Emails », admins) : sélection par fonction/compétence, disponibilité, statut ; modèles ; email « Disponibilité » (réponses appliquées automatiquement à la fiche, au tableau et à l'Excel) ou « libre » ; préparation puis lancement par l'admin. Tables créées (migrations 14 et 17). **Envoi réel coupé** tant qu'Exchange n'est pas branché (`EMAILS_ENVOI_ACTIF`).

- **14 améliorations (10/11, après-midi)** : double authentification (Paramètres → Double authentification, exigée une fois activée) ; journal d'accès consultable ; comparaison et fusion des doublons (migration 18) ; recherche dans le texte des CV (migration 19) ; « À relancer » et « profils à 80+ à appeler » sur le tableau de bord ; filtres rapides Consultants ; shortlist client et export Excel d'une mission ; historique de la fiche en frise ; bilan de santé ; version téléphone ; tests (147) ; documentation (guides mis à jour + `docs/presentation-fonctionnelle.html`).

- **Durée des connexions (10/11)** : 7 jours maximum depuis la connexion, 3 jours sans activité ; appliqué par l'outil (réglage Supabase refusé : non inclus dans la formule).

- **7 améliorations (10/11, soir)** : notes rapides de l'équipe sur les fiches (migration 20) ; « Nouveaux profils pour vos missions » sur le tableau de bord ; sauvegarde Excel hebdomadaire dans SharePoint (lundi) ; statistiques ; lecture des CV scannés par l'IA et des vieux .doc par Microsoft ; **CV Unitech** (Word + PDF anonymisé au modèle Unitech, adéquation à la mission, gabarit `src/lib/cv-unitech/gabarit-unitech.docx` sans donnée personnelle, migration 21) ; dépôt automatique des CV email après validation du rendu (réglage `cv_unitech_depot_metier`, mode essai par défaut).

## En attente de l'utilisatrice
1. Copier l'historique des emails (2-3 semaines) du groupe recrutement dans la boîte ATS Candidatures, puis Paramètres → Candidatures email → « Traiter les nouveaux emails » (relancer tant qu'il en reste).
2. Jalon C : 3 missions passées avec les bons profils.
3. Jalon D : valider `RGPD.md` (mention, registre) et compléter l'adresse de contact RGPD ; ajouter la mention à la réponse automatique de recrutement@.
4. Test de restauration de sauvegarde (procédure dans `GUIDE_EXPLOITATION.md` § 7) et invitation de l'équipe.
5. Bascule de fin de transition : décider la date où l'ATS devient la seule référence (la synchronisation Excel sera alors arrêtée).

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

### Étape 5 — Connexion SharePoint (9 novembre 2026, en cours)
- **Fait** : module `src/lib/sharepoint` en lecture seule (jeton Microsoft, parcours des dossiers métier, delta, téléchargement en mémoire, empreinte SHA-256, extraction locale .docx avec mammoth et .pdf avec unpdf, deux bibliothèques gratuites) ; analyseur des noms de fichiers (provisoire) ; association Word ↔ PDF (trigramme, puis similarité de texte locale, puis fonction ; un PDF ne va jamais à deux Word).
- **Testé** : 24 nouveaux tests (99 au total, tous verts) avec des fichiers Word/PDF générés et un Microsoft Graph simulé.
- **Ajouté ensuite** : scripts `scripts/inventaire-sharepoint.ts` et `scripts/echantillon-association.ts` (prêts, pas encore lancés) ; migration `20261109000007_association_documents.sql` (méthode/similarité d'association, table `sharepoint_etat` pour le lien delta) — **déjà appliquée dans Supabase**.
- **Contrôle 17 h 45** : nouveau jeton toujours **sans aucun rôle** ; lecture du site refusée (Graph 401 « generalException »). Le consentement n'est pas encore effectif côté Microsoft.
- **Bloqué** : le jeton Microsoft ne contient aucune permission → `Sites.Selected` (type « Application ») doit recevoir le **consentement administrateur** dans Entra. Ensuite : inventaire réel, calibrage de l'analyseur sur les vrais noms, échantillon de 20, jalon A.

### Tableau de suivi et nouvelle présentation (9 novembre 2026, demande de l'utilisatrice)
- **Fait** : page « Tableau de suivi » = copie fidèle de l'Excel (tous les onglets, mêmes en-têtes, même ordre, prénom et nom séparés) ; filtres par colonne façon Excel, tri, recherche, modification d'une cellule (double-clic) ou d'une colonne sur plusieurs lignes, copie des emails/téléphones, export Excel (admins) ; les modifications de l'onglet principal mettent à jour la fiche consultant (historique + journal). Nouvelle présentation : menu à gauche, couleurs de marque, tableau de bord refait. Tables `tableau_onglets` / `tableau_lignes` créées dans Supabase (RLS).
- **Testé** : 83 tests (dont RLS des nouvelles tables, lecture multi-onglets, filtres, tri, mise à jour des fiches) ; compilation ; écrans vérifiés dans un navigateur.
- **Ensuite** : l'utilisatrice réimporte son fichier Excel (Paramètres → Import) pour charger tous les onglets ; couleurs exactes d'Unitech à fournir.

### Étape 5 — inventaire et association (9 novembre 2026)
- **Fait** : lecture SharePoint opérationnelle (1 920 fichiers, 80 dossiers métier). Convention réelle : « UNITECH SOLUTIONS - CV Prénom Nom - Métier.docx » (Word Unitech nominatif) et « UNITECH SOLUTIONS - CV TRI - Métier.pdf » (PDF anonymisé) ; 430 PDF hors convention = CV d'origine des consultants. 501 Word associés à leur PDF anonymisé (même dossier, même trigramme ; 91 avec plusieurs versions PDF, la plus récente en premier) ; 383 reliés à une fiche consultant par le nom.
- **Testé** : lecture seule, enregistrement en base contrôlé (501 Word, 511 PDF).
- **Reste** : 129 Word sans PDF trouvé, 118 Word sans fiche consultant, documents hors convention — à traiter plus tard (décision de l'utilisatrice).

## Réponses reçues (6 novembre 2026)
1. Boîte de candidatures : adresse existante **`recrutement@unitechsolutions.fr`** (type de boîte à relever en partie 3.1 du guide). L'utilisatrice **est l'administratrice Microsoft 365** → la partie 3 du guide est un pas-à-pas d'administration (plus de demande à un tiers).
2. CV SharePoint rangés **par métier** (un dossier par métier).
3. Connexion des équipes avec **leurs comptes Microsoft 365** : oui (coût supplémentaire : 0 €).

## Questions en attente (à toi)
Aucune pour l'instant. Prochaine action : suivre `GUIDE_PREPARATION.md` (parties 1 à 5) puis écrire « Guide suivi ».

## Décisions à confirmer (appliquées par défaut, non bloquantes)
| # | Décision recommandée | Pourquoi |
|---|---|---|
| D20 | **Un seul onglet à terme** : le tableau de suivi (copie de l'Excel) devient la vue principale ; un clic sur une ligne ouvre la fiche complète (compétences, documents, propositions, historique). L'onglet Consultants disparaît. **À faire après le test des CV SharePoint** (décision de l'utilisatrice du 9/11/2026). | Supprimer le doublon entre les deux vues. |
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
| D14 | **Garde-fou association** : même avec un seul PDF au bon trigramme, si les deux textes n'ont presque rien en commun (similarité < 0,3), l'association passe en « douteux » au lieu d'être automatique. Seuils (0,5 minimum, écart 0,15) à calibrer sur l'échantillon. | Évite d'associer le CV d'un homonyme de trigramme. |
| D17 | **Tableau de suivi** : seul le 1er onglet crée/alimente les fiches consultants ; les autres onglets sont recopiés tels quels. Réimporter le fichier **remplace** le tableau (pas les fiches). | À confirmer selon le contenu des autres onglets. |
| D18 | **Couleurs** : bleu provisoire, modifiable en un seul endroit (`src/app/globals.css`, famille « marque »). | En attente des codes couleur / logo d'Unitech. |
| D19 | **Traitements en masse** : modifier une colonne, copier emails/téléphones, exporter la sélection (export réservé aux admins, règle du brief). | Autres traitements à préciser par l'utilisatrice. |
| D8 | **Haiku et Sonnet 5.5** : thinking désactivé ou `effort: low` pour les extractions. | La réflexion est facturée comme sortie ; inutile pour de l'extraction. |

## Coûts IA réels
| 10/11/2026 | Analyse de 323 CV (lot Haiku 5.5) | 0,17 $ |
| Date | Traitement | Coût réel |
|---|---|---|
| — | — | 0 $ |

### 10/11/2026 — Corrections (mission, recherche, CV Unitech, lien Email)
- Fait : statut de mission enregistré automatiquement (« Enregistré ✓ ») ; recherche : badge « mot dans le CV » + case pour l'exclure ; CV Unitech générés conservés (table `cv_unitech_generes`) et listés sur la fiche et la carte mission ; lien « Email » remplacé par « CV reçu » (fichier copié dans SharePoint, `Candidatures reçues/<mois>`).
- Testé : 153 tests, règles RLS (21), build.
- Suite : 522 CV de l'historique du groupe sans fichier (accès groupe retiré) — récupérables si Group.Read.All est remis temporairement (à décider).

### 10/11/2026 — Correction des statuts
- Fait : « CDI / Freelance » dans l'Excel ne donne plus « consultant » ; 259 fiches remises en « candidat » (historique `correction_statut`, liste d'origine sauvegardée). « En mission » = déjà en mission, pas disponible.
- Testé : test du statut lu dans l'Excel ; contrôle en base (4 259 candidats, 72 en mission, 2 inactifs).
- Suite : rien.
