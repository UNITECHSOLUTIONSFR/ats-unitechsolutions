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
| D17 | **Import de fichier = ajout** (décision de l'utilisatrice du 15/11/2026) : un fichier importé s'ajoute à la base, colonnes rattachées par titre ; consultant existant (email, sinon téléphone) = cases vides seulement ; colonnes absentes ignorées sauf si l'admin les coche (ajoutées en fin de tableau et dans l'Excel). Le fichier de suivi reste relu chaque nuit. | Confirmé. |
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

### 10/11/2026 (soir) — Tests et corrections
- Fait : liens CV Word inutilisables (Outlook) remplacés dans les missions ; 13 CV SharePoint restés au modèle Unitech vierge signalés avec ce motif ; coût des seconds essais (Sonnet) compté au bon tarif.
- Testé : 156 tests, matching sur les 3 missions, tableau, accès sans connexion refusés.
- À surveiller : aucune exécution planifiée GitHub depuis la création du workflow (seulement les lancements manuels) ; vérifier après 2 h.

### 11/11/2026 (2 h 50) — Contrôle des tâches de nuit
- Constat : une seule exécution planifiée GitHub depuis la création (emails, 21 h 50 UTC au lieu de 21 h 17) ; rien depuis : ni emails horaires, ni Excel (01 h 00 UTC), ni CV (01 h 30 UTC).
- Cause : planificateur GitHub non fiable (retards, exécutions sautées), le code et le secret fonctionnent (lancements manuels et exécution de 21 h 50 réussis).
- Proposition (à valider) : planification de secours par Supabase (pg_cron) appelant les mêmes adresses, clé stockée dans le coffre Supabase par l'utilisatrice.

### Liste du 11/11/2026 (go donné) — FAIT, sauf actions de l'utilisatrice
1. Bilan quotidien pour les administrateurs : ce qui a réussi ou échoué dans les tâches de la nuit (Excel, CV, emails, sauvegarde).
2. Rappel avant expiration de chaque secret (Microsoft, Vercel, GitHub, Supabase, IA…) : date saisie par un admin, rappel 30 jours et 7 jours avant.
3. Relevé de la consommation IA (jour et semaine) avec le plafond du mois.
4. Planificateur de secours Supabase (pg_cron), en attente du go.
5. Recherche : pour un résultat trouvé dans le CV, afficher l'extrait contenant le mot et préciser quel CV (SharePoint ou reçu par email). Option (a) validée, capture à montrer avant mise en ligne.
6. Recherche en conversation (onglet Consultants) : phrase libre → critères (IA, ~0,1 centime/question) → matching sans IA sur toute la base ; affinage dans la conversation. Critère disponibilité ignoré pour l'instant.
7. Nouveau champ « Mobilité » sur la fiche, saisi à la main (Paris, Île-de-France, France, Monde entier…), utilisé dans les filtres et la recherche.
8. Nouvelle page Consultants (modèle fourni le 11/11) : filtres à gauche, résultats en cartes à droite mis à jour en temps réel ; capture à montrer avant mise en ligne.

### 11/11/2026 — Liste réalisée
- Fait : mobilité (champ fiche) ; extraits de CV dans la recherche ; bilan du jour administrateurs (tâches, échéances des secrets, consommation IA) ; section Recherche (conversation, filtres, cartes) ; planificateur de secours Supabase (pg_cron, 5 min après GitHub) + protection contre les doubles passages.
- Testé : 166 tests, moteur de recherche sur données réelles (DevOps, Orange, banque), aperçu écran ordinateur et téléphone, planificateur inactif sans clé.
- Suite (utilisatrice) : clé `cron_secret` dans Supabase Vault ; dates des secrets ; puis la liste A_FAIRE_14H.md.

### 12/11/2026 (nuit) — Matching contextuel, récupération des CV, écrans
- Fait : statuts (tous candidats, filtre retiré des Emails et de la Recherche, 72 « en mission » corrigées) ; référentiel de compétences regroupé (5 601 → 5 117, familles .NET, versions ignorées) ; matching contextuel (compétence trouvée dans le CV ou la ligne Excel = 60 % des points, technologie de l'intitulé, 4 obligatoires au plus) ; 1 408 fichiers SharePoint lus, 219 CV reliés, 161 fiches créées, 189 PDF anonymisés rattachés ; analyse IA de 241 CV lancée (≈ 0,17 $) ; écrans Missions, Exigences, Recherche, Emails (modèles), Cas à vérifier refaits.
- Testé : 180 tests (dont 24 règles d'accès), classements .NET (24 → 44 profils ≥ 50), Full Stack (11 → 39), recherche « Développeur .NET », captures des écrans.
- Suite : point du matin ; actions de l'utilisatrice (clé du planificateur de secours, dates des secrets, A_FAIRE_14H.md).

### 12/11/2026 (nuit, suite) — Mobile
- Fait : barre d'onglets en bas, menu plein écran, encoche et barre système respectées, installation sur l'écran d'accueil (manifeste, icônes), écrans adaptés (consultants en fiches avec appel, mission avec score visible et compétences repliées, recherche avec filtres repliés), iPhone sans zoom à la saisie ; exigences « Obligatoires / Souhaitées » expliquées ; matching contextuel mémorisé (≈ 2 s par mission).
- Testé : 29 écrans sur 6 appareils (iPhone SE, 15, 15 Pro Max, Pixel 7, Galaxy S8, iPad Mini), plus aucun débordement ; 180 tests.
- À décider : LinkedIn (lien sur la fiche + import du PDF exporté depuis LinkedIn, ≈ 0,005 $ par profil).

### 12/11/2026 (nuit, fin) — WhatsApp, besoin en bref, avis IA, sécurité
- Fait : bouton WhatsApp partout où l'on peut appeler (wa.me, message pré-rempli, aucune connexion) ; « Le besoin en bref » (indispensables + environnement technique) à la création et sur la mission ; « ✨ Avis IA » sur demande par consultant (Haiku, ≈ 0,1 centime, gardé en base) ; revue de sécurité (28 tables sous RLS, droits des fonctions resserrés, uuid corrigé : 0 faille connue) ; route d'essai CV Unitech supprimée ; LinkedIn abandonné (RGPD, conditions de LinkedIn).
- Testé : 182 tests (dont 26 règles d'accès), export Excel, captures ordinateur et téléphone.
- Suite : uniquement les actions de l'utilisatrice (A_FAIRE_14H.md), puis invitation des collaborateurs.
- 12/11 3 h 15 : résultats de l'analyse IA des 241 CV récupérés ; 1 075 fiches ont désormais des compétences analysées (contre 914) ; index des textes rafraîchi.

### 13/11/2026 — Passe UX/UI et écran des recruteurs
- **Fait** : les « Traitements des dernières 24 heures » sont retirés du tableau de bord (le résumé technique reste dans le bilan des administrateurs). Les recruteurs ne voient plus aucune alerte technique : rapprochement Word ↔ PDF masqué, lignes Excel masquées. Nouvelle charte : cartes blanches nettes, boutons bleu Unitech, titres de blocs lisibles. Cartes de profils (mission) refaites : score bien visible, actions alignées, « Pourquoi ce score » sans détail technique. Statut « En mission » retiré de la fiche.
- **Testé** : typage, 185 tests, captures ordinateur (recruteur et admin), contrôle mobile iPhone SE / Pixel 7 sans débordement.
- **Suite** : actions de l'utilisatrice (A_FAIRE_14H.md) ce week-end.

### 13/11/2026 (après-midi) — Fiche consultant, vitesse, reprise de la boîte personnelle
- **Fait** : fiche consultant avec aperçu du CV, missions ouvertes pour ce profil (pastilles), évaluation pour la mission d'origine ; score en jauge et « Pourquoi ce score » en clair ; nombre de profils pertinents sur la liste des missions ; classement des missions gardé en mémoire côté serveur (recalcul à la modification ou toutes les 15 min). Téléphones étrangers reconnus (133 corrigés, 8 à reprendre à la main). Consultants : vues « Toute la base / Reçus par email aujourd'hui / Ajoutés depuis SharePoint aujourd'hui ». Reprise unique du dossier Outlook « Consultant » de l'administratrice (accès Exchange temporaire, retiré) : 577 emails, 469 CV, 142 fiches créées, 195 complétées, 0,99 $, CV non déposés dans SharePoint (décision : rangement au moment du Word Unitech).
- **Testé** : 184 tests, build de production, captures, contrôle des droits Exchange (InScope False après retrait).
- **Suite** : jalon C (4 missions passées à créer + personnes retenues), jalon D (infos RGPD), envoi test, 12 doublons et 5 CV illisibles à trancher.

### 15/11/2026 — Import de fichiers annexes (ajout, sans écrasement)
- Fait : Paramètres → Import d'un fichier Excel ajoute le contenu à la base (plus de remplacement du tableau). Colonnes rattachées par titre ou par sens (« Tél » → « Téléphone »). Personne déjà en base : seules les cases vides sont remplies. Colonnes absentes : cochables pour les ajouter. Nouveaux consultants (origine `import_annexe`, migration 33) ajoutés au fichier Excel de suivi la nuit ; cases remplies sur des personnes déjà dans l'Excel recopiées la nuit, uniquement dans des cases vides ; colonnes ajoutées créées en fin de 1re ligne de l'Excel.
- Testé : 186 tests (dont import annexe avec base simulée), rattachement vérifié sur les 18 colonnes réelles, lint, build.
- Suite : mise en production après le go de l'utilisatrice, puis import de ses fichiers annexes.


### 15-16/11/2026 — Corrections et vitesse
- Fait : écran Consultants rechargé (envoi sans compression manuelle, relecture directe en secours) ; effacement d'une fiche sans page 404 (retour à la liste) ; croix du panneau réparée ; panneau de fiche ouvert instantanément (aperçu du tableau) ; fiche lue en parallèle de la vérification du compte, journal écrit après la réponse ; règles d'accès de la base évaluées une fois par requête (migration 34, appliquée) : 900 ms → 15 ms sur 30 000 lignes, recherche 106 → 4 ms.
- Testé : 186 tests dont 25 de règles d'accès, contrôle en base (82 règles réécrites, compte inconnu toujours sans accès), build.
- Suite : retour de l'utilisatrice sur la vitesse réelle ; 2 fiches vides issues de l'import à effacer par elle.

### 16/11/2026 — Connexion Trello (lecture seule)
- Fait : lecture du tableau Trello « new tab UTS 2027 » (migration 35 : champs trello_*, tjm, statuts « chez le client » et « en pause ») ; une carte = une mission (identifiant stable, jamais de doublon), statut et recruteur tirés de la colonne, client du titre, compétences de la description + pièce jointe (une lecture IA par texte, TJM retiré), missions existantes reliées par intitulé ; tâche horaire GitHub (`trello`, minute 47) + bouton « Actualiser depuis Trello » (admin) ; TJM interne affiché ; plus de création de mission dans l'outil ; Paramètres → Trello = aperçu en simulation (rien n'est écrit). Lecture réelle désactivée sur les versions d'aperçu (même base que la production).
- Testé : 204 tests (dont 17 règles Trello), build. Pas de test réel depuis la session (Trello bloqué ici, clé seulement dans Vercel).
- Suite : l'utilisatrice vérifie Paramètres → Trello sur la version d'aperçu, puis go pour la mise en ligne et la première lecture réelle.

### 16/11/2026 — Grille des missions, vitesse, revue de sécurité avant l'ouverture aux équipes
- Fait : missions en grille « décision » ; classements jamais calculés deux fois, 2 à la fois au plus, préparés après chaque lecture Trello/email ; recherche dans les textes compétence par compétence (fin des dépassements de délai), gardée 6 h (migration 36) ; titres Trello « Poste - Client - Contact ».
- Sécurité : visiteur non connecté = aucun accès (vérifié en appelant l'API publique sur 22 tables et 6 fonctions) ; droits « anon » retirés, fonctions de déclenchement non appelables, ancienne recherche par motifs réservée au serveur, search_path figé, index en double retiré (migration 37) ; écrans admin fermés aux recruteurs (vérifié) ; mot de passe provisoire : changé côté serveur (impossible de retirer la mention sans le changer) ; désinscription des relances : confirmation par clic (les antivirus de messagerie ouvrent les liens) ; aucun secret dans l'historique Git. Non disponible : protection contre les mots de passe divulgués (offre Supabase supérieure).
- Testé : 209 tests (26 de règles d'accès), 27 écrans ouverts sans erreur (admin), parcours recruteur, build.
- Suite : réponse de l'utilisatrice sur la modification / suppression des missions ; carte Trello « IMPORTANT | % Contribution » (à ignorer ?).

### 16/11/2026 (matin) — Consultants, activité de l'équipe, matching par métier
- Fait : écran Consultants réorganisé (actions à droite, un bouton « Filtres », pastilles des filtres actifs) ; Paramètres → Activité de l'équipe (recherches, fiches consultées/ajoutées, modifications, par personne et par jour, actualisée chaque minute ; migration 38) ; missions modifiables/supprimables ; cartes « IMPORTANT » ignorées ; plus d'ajout automatique sur mission sans compétence (380 ajouts erronés retirés) ; matching par famille de métier (classements recalculés, clé v2) ; Trello ajouté au planificateur de secours Supabase chaque heure (migration 39 : GitHub ne déclenche que quelques fois par jour).
- Testé : 241 tests ; mission « Testeur QA fonctionnel » : le top 15 ne contient plus que des profils de test.
- Suite : proximité de sens (embeddings gratuits) pour les 20 points « contexte », jamais calculés jusqu'ici.

### 16/11/2026 — Matching avec IA
- Fait : 2e temps du matching par l'IA (Haiku lit la mission entière et les 30 premiers profils, anonymes → pertinent / à étudier / hors sujet + raison, migration 40 `avis_matching`) ; ordre : pertinents, à étudier, non lus, hors sujet ; avis affiché sur chaque profil ; métier d'après les titres devenu un simple indice (−30 %) ; classements recalculés (clé v3).
- Testé : 242 tests (dont tri IA simulé : ordre, aucun nom ni coordonnée envoyés, avis réutilisés) ; appel réel de l'IA seulement en production (clé sur Vercel).
- Suite : vérifier le coût réel après la première préparation des classements ; proximité de sens (modèle gratuit).


### 16/11/2026 — Bilan cliquable + tâches de nuit bloquées
- Fait : alertes du bilan cliquables (tâche en retard → Synchronisations, secrets → Échéances, secours → Santé) ; recopie vers l'Excel limitée à 90 s (le reste la nuit suivante) ; étapes secondaires de la tâche CV reportées si le temps manque ; exécutions restées « en cours » > 15 min closes en échec.
- Testé : 242 tests, compilation OK.
- Suite : relancer Excel et CV depuis Synchronisations ; récupération des fichiers CV (bouton admin) ; décision sur la méthode de matching.

### 16/11/2026 — Remplacer le Word Unitech + reprise du groupe recrutement@
- Fait : bouton « Remplacer le Word Unitech » sur chaque CV généré (Word déposé à la place de l'ancien, même nom, PDF refait) ; récupération des fichiers du groupe en plusieurs passages (lecture des fils reprise là où elle s'est arrêtée, réglage `reprise_groupe_fils`, arrêt avant 5 min).
- Testé : 242 tests, compilation, capture du bouton.
- Suite : relancer la récupération du groupe puis de la boîte « Consultant » ; refermer les accès ensuite.

### 17/11/2026 — Phase 1 « vitesse » (recommandation du développeur senior)
- Fait : classements des missions rangés dans la base (table `classements_mission`), recalculés en arrière-plan (tâche `matching` toutes les 10 min, recalcul ciblé quand une mission change, bouton « Recalculer », date affichée, ancien classement gardé pendant le calcul) ; écran Consultants paginé côté serveur (projection `tableau_vue`, 50 lignes, recherche/filtres/tri dans Postgres, export par critères) ; préchargement des 3,9 Mo supprimé ; recherche dans les CV en deux temps (extraits seulement pour la page) ; page mission allégée.
- Mesures (serveur local, base de production, « froid » = sans mémoire) : accueil 9,9 s → 1,5 s ; liste des missions 16,9 s → 1,0 s ; écran Consultants : 3,9 Mo téléchargés → 50 lignes (≈ 60 Ko) ; recherche « java paris » ≈ 0,3-0,9 s ; filtre de colonne 0,2 s ; mission ≈ 0,8 s (1,2 Mo → 1,1 Mo).
- Testé : 244 tests (dont base : migrations 42-43), compilation, parcours navigateur (recherche, filtre, page suivante, mission, liste) sans erreur.
- Suite : mise en ligne après go ; mesurer en production ; phase 2 selon les chiffres (fiche consultant ≈ 1,5-2,5 s : aperçu du CV).

### 17/11/2026 — Nouvelle méthode de matching (go de l'utilisatrice, option A : Voyage AI)
- Fait : empreintes de sens Voyage AI (5 078 fiches calculées, gratuit) ; présélection sens + compétences fusionnée ; note /100 + raison de l'IA sur 60 profils ; apprentissage par les décisions de l'équipe ; liste de métiers abandonnée ; export mission aligné sur l'écran.
- Testé : 244 tests (dont nouveau test du matching : profil proche par le sens lu par l'IA, notes gardées, aucune donnée personnelle envoyée), compilation. Comparaison avec l'ancienne méthode sur 3 missions (Support RATP, Testeur QA, Développeur IA) faite en ligne (la clé IA n'est que sur le site) ; copie des anciens classements gardée.
- Suite : vérifier la comparaison ; retour à l'ancienne méthode si moins bon.

### Nuit du 16 au 17/11/2026 — Vitesse phase 2, matching validé, fiche complète, tests de bout en bout, sécurité
- **Matching** : comparaison sur 3 missions (Développeur IA, Testeur QA, Support RATP) → la nouvelle méthode (sens + compétences, note IA sur 60) classe mieux sur les trois ; gardée. Recherche par le sens accélérée (6-12 s → 0,1-0,4 s : halfvec + HNSW, délai serveur 60 s).
- **Vitesse phase 2** : mesure des temps réels des écrans (Paramètres → Santé) ; accueil 25 → 12 lectures ; bilan 8 → 1 ; page mission 1,1 Mo → 0,5 Mo (20 profils puis les suivants, comptage en base) ; frise de la fiche lue en parallèle ; Paramètres → CV en une lecture jointe.
- **Fiche consultant** : toutes les cases modifiables (dont profil, compétences, colonnes libres) ; répercutées sur le tableau, l'Excel d'origine (remplacement la nuit), les fichiers SharePoint et le CV Unitech, le matching. Les cellules modifiées dans le tableau partent aussi vers l'Excel.
- **CV SharePoint** : 40 Word sans fiche (et non 118) → 14 rattachés (nom, ou trigramme + poste confirmé), 24 rangés dans « Sauvegardes ATS / À supprimer », 2 modèles laissés en place.
- **Sécurité** : fonctions récentes retirées à public/anon ; protection des mots de passe divulgués (HIBP) non disponible sur l'offre actuelle ; accès Microsoft temporaires refermés.
- **Tests** : 245 tests ; bout en bout 42/42 (admin) et 39/39 (recruteur), fiche de test créée/modifiée/effacée.
- **Documentation** : dossier de spécification (fonctionnalités + user stories) à jour : https://claude.ai/artifact/USNTKdcE8NzuZpFCurgeC5
- **Reste** : jalon D et test de restauration (17/11 en journée) ; vitesse phase 3 selon les temps réels ; vider « À supprimer » (utilisatrice).

### 17/11/2026 matin — Activité, tâches de nuit
- Fait : Activité → nombre de fiches ajoutées cliquable (par personne ou équipe ; aujourd'hui / 7 / 30 jours) → liste des consultants ajoutés (saisies + imports). Tâche Excel coupée en deux (écriture 2 h 05, relecture 2 h 25) ; durées de chaque étape de la tâche CV notées au fil de l'eau.
- Constaté : nuit du 16 au 17, tâches Excel et CV coupées par la limite de 5 minutes (Excel : 28 cases recopiées, 18 restantes). Accès Microsoft « Group.Read.All » encore présent dans le jeton à 2 h 04 malgré la révocation annoncée.
- Suite : vérifier la nuit du 17 au 18 (Excel, relecture, CV) ; révocation de Group.Read.All à refaire (utilisatrice).

### 17/11/2026 matin (suite) — Tâches de nuit réparées, notes, Trello, Word
- Excel : écriture d'une ligne en une seule demande (9 s/fiche → quelques secondes pour toutes) ; relancé à la main → terminé, 0 case en attente, Excel relu (8 fiches mises à jour, 1 créée). Relecture seule ≈ 4 min 30 : à accélérer.
- CV : le lot d'analyse du 15/11 (196 CV) n'aboutissait jamais (tout-ou-rien > 5 min) → enregistrement par morceaux ; 4 relances → 193 enregistrés, 3 échecs (0,14 $). Nouveau lot de 199 CV envoyé (0,14 $ estimé), récupéré par morceaux la nuit.
- Fiche : « Notes de l'équipe » datées et signées (plus d'écrasement).
- Trello : nouvelles missions aussi par « Sourcing Anaelle » et « Sourcing Amadou » (pas M CISSE) ; import au prochain passage horaire.
- CV Unitech : Word sans cadres flottants (bandeau et rubriques en paragraphes sur fond coloré), facile à modifier.


## 17/11/2026 — Matching « pertinents seulement »
- Fait : cause trouvée sur la mission UX/UI SNCF Réseau : la compétence indispensable « Audit UX » écartait 741 profils sur 746 (mot exact absent) → l'IA n'en lisait que 5. Désormais : plus d'élimination sur une compétence, l'IA lit 100 profils (28 designers UX/UI pour cette mission), seuls les profils notés ≥ 60 s'affichent ; nouvelle fiche → comparée aux missions proches.
- Testé : 247 tests OK, build OK. Notes IA non vérifiables depuis la session (clé Anthropic seulement dans Vercel).
- Suite : mise en ligne après accord ; recalcul automatique de toutes les missions (≈ 0,02 $ par mission).

## 17/11/2026 — Lenteurs : allègement de la base
- Fait : cause = tâches de fond qui occupaient la base pendant la journée (copie de l'écran Consultants refaite en entier jusqu'à ~40 fois/heure avec des lectures répétées ; 22 classements refaits toutes les 10 min ; index plein texte des CV refaits toutes les heures). Désormais : lectures en un seul appel (`competences_consultants_json`, `tableau_vue_empreintes`), passage de sécurité horaire, classements refaits au plus toutes les 3 h pour des fiches modifiées (une fiche modifiée dans l'outil est comparée tout de suite à ses missions), index CV toutes les 3 h, 10 premiers profils rangés à part (`classements_mission.premiers`) : lecture de la liste des missions 200 ms → 0,1 ms dans la base. Boutons mesurés (`mesures_ecrans.type = 'action'`).
- Testé : 247 tests, build ; projection identique (4 999 lignes, 0 différence).
- Suite : mise en ligne après accord, puis comparaison des temps réels (Paramètres → Santé) sur une journée.

## 17/11/2026 (soir) — Vitesse phase 3 (carte blanche jusqu'au 18/11 10 h)
- Fait : boutons sans attente (CV lu par l'IA en arrière-plan à la création et à l'ajout, Word Unitech préparé en arrière-plan, recherche en phrase libre mémorisée, suivi d'un profil immédiat), serveur gardé éveillé, serveur déplacé à Londres à côté de la base (requête 50-110 ms → 22-39 ms), objectifs de vitesse + alerte (Santé), tableau Excel mis à jour en place, une seule synchronisation Excel à la fois, Trello relancé en cas de panne passagère, horaires réels des synchronisations, aperçu Trello sur demande.
- Testé : 248 tests ; bout en bout 42/42 (admin) et 39/39 (recruteur) sur la copie avec l'accès d'essai.
- Suite : comparer les temps réels (Santé) demain ; à partir du 18/11 10 h, accord avant chaque mise en ligne.

## 18/11/2026 — Matching v2 et corrections
- Fait : corrections (message clair au lieu d'une page d'erreur sur une fiche, avertissement de doublon à la création, journal sans doublons de consultation) ; emails relevés chaque heure par la tâche matching ; matching v2 (critères obligatoires, recherche stricte dans les CV complets, IA sur CV complet, note plafonnée si critère non prouvé, profils proches, critères corrigeables, mesure de qualité) d'abord calculé en aperçu puis activé ; tri du tableau mesuré.
- Testé : 250 tests ; bout en bout 42/42 ; aperçu sur 29 missions (18 avec profils pertinents ; 11 sans : compétences rares ou critères trop stricts à corriger). Coût : 0,39 $ pour trois calculs complets.
- Suite : corriger les critères trop stricts (IARDT corporate, assurance construction…) ; mesurer la qualité avec les décisions de l'équipe ; mesurer le tri du tableau.

## 19/11/2026 — Audit vitesse et recherche
- Fait : empreintes vérifiées seulement après un changement (5 s toutes les 10 min supprimées) + index de détection ; tri du tableau sur lignes étroites (résultat identique) ; « Enregistrer » répond avant la suite ; temps serveur du tableau mesuré ; mesures de la copie de test ignorées ; recherche dans les CV : fonctions en droits du propriétaire avec contrôle « utilisateur actif » (6,2 s → 0,02 s sous RLS, cause des coupures à 8 s) ; écran Consultants : recherche uniquement dans les colonnes (plus de CV).
- Testé : 250 tests ; résultats identiques avant/après (tri, recherche CV : 656 pour « java ») ; accès anonyme refusé.
- Suite : vérifier les temps réels demain (Santé) ; à partir du 19/11 10 h, accord avant chaque mise en ligne.

## 19/11/2026 — Retours d'une collaboratrice après une semaine
- Fait : dates et heures affichées à l'heure de Paris partout (le serveur à Londres décalait l'historique d'une heure) ; lecture des CV par l'IA : réponse jusqu'à 4 000 jetons (1 500 coupait les CV longs → « lecture impossible ») ; « la fiche existe déjà » : la fiche existante est nommée avec un lien, et un double envoi rouvre la fiche qui vient d'être créée ; message clair « CV bien enregistré ✓ » quand l'IA n'a pas pu le lire ; écran d'une mission jamais bloqué par un calcul (classement préparé en arrière-plan) et chargement en parallèle ; évaluation IA détaillée par profil (récapitulatif + analyse point par point), une seule note partout.
- Testé : 250 tests, construction ; tests de bout en bout à refaire hors des heures de travail.
- Suite : suivre les temps réels de l'écran d'une mission ; vérifier qu'aucune fiche créée avec CV ne reste sans document.

## 19/11/2026 — PowerPoint du comité et vue Kanban
- Fait : PowerPoint du comité (19 diapositives : vision et chiffres réels, points bloquants, 9 modules en couleur et leur détail, diagramme de séquence, backlog, roadmaps fonctionnelle et technique à 6 mois, vision ERP) ; vue Kanban des missions (/missions/kanban) : mêmes colonnes que Trello, dans le même ordre, avec pertinents et suivis par mission (Trello fait foi, lecture seule).
- Testé : 250 tests, construction, capture de la vue Kanban sur les vraies données.
- Suite : glisser-déposer des consultants dans un pipeline par mission (roadmap M+2) ; écriture dans Trello seulement si elle est autorisée.

## 20/11/2026 — PowerPoint technique et glisser-déposer Kanban → Trello
- Fait : PowerPoint du comité refait (66 diapositives : architecture d'ensemble, architecture par module, diagramme de séquence de chacune des 36 fonctionnalités avec durées mesurées, avant / après / ne fait pas) ; vue Kanban : glisser une carte vers une autre colonne la déplace aussi dans Trello (seule écriture Trello autorisée, décision du 20/11/2026), carte déplacée tout de suite à l'écran, remise en place si Trello refuse, bouton « Annuler » 10 s, trace dans le journal ; statut et recruteur de la mission suivent la colonne (mêmes règles que la lecture horaire).
- Testé : 254 tests (règles de déplacement, refus d'identifiants invalides), compilation ; glisser-déposer essayé sur une copie locale avec l'envoi vers Trello bloqué (carte déplacée puis remise en place avec le message).
- Suite : jeton « lecture et écriture » posé par l'utilisatrice dans Vercel ; mis en ligne le 21/11/2026 avec son accord ; premier essai réel à faire par l'équipe (glisser une carte, vérifier dans Trello, Annuler), contrôlé ensuite dans le journal.

## 23/11/2026 — Un seul CV par consultant dans SharePoint, fiches en double
- Fait : SharePoint ne reçoit plus que le CV de base (Word + premier PDF) ; les CV d'adéquation suivants (Word et PDF) restent dans l'outil (espace privé `cv-adequation`, conversion PDF par Microsoft via un fichier temporaire retiré aussitôt) ; synchronisation de nuit : CV produits par l'outil rattachés à leur fiche par identifiant (jamais retirés d'une fiche choisie par l'équipe), noms rapprochés souplement, une seule fiche pour des fichiers au même nom ; fusion des 5 fiches d'Amine AIT OUMAJOUD en une (sauvegarde avant fusion), ses 4 CV rattachés.
- Testé : 259 tests (dont rapprochement souple des noms), compilation, migration appliquée (colonnes + espace privé).
- Suite : mis en ligne le 23/11/2026 avec son accord ; Aissata / Aissatou DIALLO : ne pas fusionner (décision du 23/11) ; premier CV d'adéquation réel à vérifier ; décisions restantes : lignes 5369-5371 de l'Excel (créées automatiquement le 20/11, à supprimer par elle), 3 CV d'adéquation d'Amine encore dans SharePoint.

## 23/11/2026 — Demande de CV aux consultants sans CV (préparée, rien n'est envoyé)
- Fait : filtre « Seulement les consultants sans CV dans l'outil » dans Emails → Rédiger (case à cocher, étape 2) ; modèle « Demande de CV et disponibilité » ; envoi préparé en brouillon (Emails → Envois, statut « préparée ») pour 3 578 consultants (email présent, non désinscrits, non inactifs, aucun CV lisible) ; un CV reçu en réponse est rangé sur la fiche de la personne à qui on a écrit (jamais une nouvelle fiche), et la disponibilité de la réponse est lue automatiquement.
- Testé : 259 tests, compilation, eslint ; envoi préparé vérifié en base (3 578 envois « à envoyer », 0 email invalide, aucun doublon).
- Suite : mise en ligne à valider par l'utilisatrice ; envoi réel impossible tant que l'envoi n'est pas branché (droit d'envoi de la boîte ats-candidatures@ + EMAILS_ENVOI_ACTIF=1 dans Vercel) ; lancement prévu par elle (mercredi matin), ≈ 2 h 30 d'envoi à 25 emails par minute.

## 23/11/2026 (soir) — FinOps, découpage des CV, matching v3 mesuré
- Fait : relecture automatique des CV par l'IA coupée (1,63 $ dépensés le 23/11 avant coupure) — seule une mission nouvelle ou modifiée est lue une fois ; plafond IA par jour (1 $) en plus du mois, coût du jour dans Santé ; 1 499 CV découpés en expériences (métier réel, rôle, dates, technologies) en lot de nuit (0,86 $) avec empreintes ; moteur v3 (la base note tous les CV avec preuves) ; suivi vide par défaut (345 suivis « proposé » automatiques retirés, sauvegardés) ; boutons « Bon profil » / « Pas pour cette mission ».
- Testé : 270 tests ; vérification par un modèle de référence sur 15 missions (552 jugements, 2,26 $) : 10 premiers jugés bons = 25 % (v3 base seule) contre 19 % (matching actuel) ; lecture des parcours résumés par l'IA (0,05 $) : 77 % des bons profils accessibles retrouvés dans les 10 premiers, mais 51 % seulement des profils affichés sont bons (60 % au seuil 70). Objectif 8/10 non atteint : v3 NON activé (`matching_v3` = false), matching actuel conservé.
- Suite : décision de l'utilisatrice sur la suite du matching ; les clics « Bon profil / Pas pour cette mission » de l'équipe deviennent la vraie mesure (la référence n'est qu'une autre IA).

## 23/11/2026 (nuit) — Matching v3 avec l'IA activé
- Fait : candidats du bon métier (calcul de la base sur les CV découpés) → l'IA note les parcours résumés → relit en entier les 20 mieux notés → affiche ceux notés ≥ 75 ; notes gardées (`notes_v3`), jamais repayées ; activé (`matching_v3`), missions recalculées en arrière-plan.
- Testé : sur 15 missions et 552 jugements de référence (CV existants) : 79 % des profils affichés jugés bons (22/28), 13 missions sur 15 avec des profils ; tests 270. Coût du test 0,10 $ environ.
- Suite : retours 👍 / 👎 de l'équipe pour ajuster le seuil ; plafond IA du jour à 2 $ pour le premier calcul des ~30 missions, à remettre à 1 $ ensuite.

## 24/11/2026 (nuit) — Audit appliqué, import Collective, matching v3 activé
- Fait : point 1 texte des consultants tenu à jour fiche par fiche (fin du recalcul global toutes les 3 h) ; point 2 contrôle complet de la liste des consultants une fois par nuit ; point 3 recalcul v3 seulement si des CV sont découpés ; point 4 découpage vérifié seulement si un document change ; point 5 un seul planificateur (Supabase) ; point 6 réveil du serveur en semaine 8 h-19 h ; point 10 empreintes gratuites comptées 0 $ ; point 11 règle « test > 0,50 $ = accord » ; points 7 et 13 matching v3 avec l'IA activé sans plafond (≈ 124 profils lus en résumé par mission, relecture complète de tous ceux ≥ 60, affichage ≥ 75) ; import Collective des 20 offres les plus récentes : 98 candidatures, 52 nouvelles fiches (source « api »), 46 rattachées à des fiches existantes, sans doublon.
- Non fait cette nuit (risque pour l'usage du matin) : point 9 (CV reçus par email lus en lot de nuit) et point 16 (alerte « CV à rattacher » au lieu de créer une fiche) ; points 14 et 15 avec l'utilisatrice.
- Suite : plafond IA du jour remis à 1 $ après le premier calcul des missions ; comparaison IA Collective / outil présentée le matin.
