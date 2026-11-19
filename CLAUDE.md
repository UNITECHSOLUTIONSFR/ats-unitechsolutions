# CLAUDE.md — Règles permanentes du projet ATS Unitech Solution

> Résumé opérationnel de `BRIEF.md` (la référence complète, à relire à chaque session).
> L'avancement et les décisions en attente sont dans `SUIVI.md`.

## 1. Contexte
- ATS interne (suivi et matching de candidats) pour Unitech Solution, porté par une personne **non développeuse**.
- Existant : fichier Excel de suivi (M365), ~2 000 CV dans SharePoint (Word nominatif + PDF anonymisé), 200 à 500 candidatures/mois.
- L'utilisatrice est **elle-même administratrice Microsoft 365** : les réglages Entra ID / Exchange / SharePoint se font avec elle, en pas-à-pas.
- **Périmètre réalisé (10/11/2026)** : import Excel, CV SharePoint, synchronisations de nuit (Excel qui fait foi pendant la transition, CV, emails), missions + matching, interface, RGPD. Emails : le groupe `recrutement@` est copié (règle Exchange) dans la boîte partagée `ats-candidatures@`, seule boîte lisible par l'outil (RBAC Exchange « Application Mail.Read »). Accès SharePoint en **lecture seule**.
- **Vitesse (phase 1, 17/11/2026)** : les classements des missions sont **rangés dans la base** (`classements_mission`, `lib/matching/stockage.ts`) et recalculés en arrière-plan par la tâche `matching` (pg_cron toutes les 10 min) : mission modifiée, fiches ou CV changés (au plus toutes les 30 min), sinon chaque nuit ; un déploiement ne recalcule rien (`VERSION_MOTEUR`). L'écran Consultants lit une **projection** (`tableau_vue`, `lib/tableau/projection.ts`) page par page (50 lignes) : recherche, filtres et tri faits par Postgres (`tableau_page`, `tableau_valeurs`, `tableau_ids`).
- **Vitesse (phase 2, 17/11/2026)** : temps réels des écrans mesurés dans le navigateur (`mesures_ecrans`, Paramètres → Santé) ; lectures regroupées ; empreintes en `halfvec` + index HNSW ; tests de bout en bout `scripts/e2e.cjs` (copie locale avec l'accès d'essai, jamais de boutons à effet extérieur).
- **Vitesse (phase 3, 17/11/2026)** : objectifs affichés dans Paramètres → Santé (écran < 0,3 s d'habitude et < 1 s 9 fois sur 10 ; bouton < 1 s 9 fois sur 10, alerte sinon) ; temps des boutons mesurés (`mesures_ecrans.type = 'action'`) ; travaux longs en arrière-plan : CV joint lu par l'IA après l'ouverture de la fiche (`lib/consultants/cv-arriere-plan.ts`, `consultants.cv_en_lecture`), Word Unitech préparé en arrière-plan depuis la fiche (`consultants.cv_unitech_en_cours`) ; lecture IA des recherches en phrase libre gardée 30 jours (`cache_recherches`) ; serveur gardé éveillé (`/api/eveil`, pg_cron `ats-eveil` toutes les 5 min de 6 h à 22 h) ; tableau Excel mis à jour en place (seules les lignes changées) ; une seule synchronisation Excel à la fois ; Trello relancé jusqu'à 3 fois en cas de panne passagère.
- **Tâches planifiées** : GitHub Actions (`.github/workflows/taches-planifiees.yml`, les crons Vercel bloquaient les déploiements) → `/api/cron/excel` (2 h), `/api/cron/cv` (2 h 30), `/api/cron/emails` (toutes les heures), protégées par `CRON_SECRET` (même valeur dans Vercel et GitHub). La relance des emails n'est jamais planifiée : seul un admin la lance.
- Les CV SharePoint sont rangés **par métier** (un dossier par métier) ; CV reçus par email déposés dans le dossier métier détecté, sinon `À classer`.
- Connexion des équipes : **lien magique** (inscription libre fermée, invitation par un admin) ; connexion Microsoft possible plus tard.
- Personne en interne ne maintiendra l'outil : **simple, robuste, documenté, peu coûteux**.
- **Tout en français** : interface, explications, documentation, messages de commit.

## 2. Façon de travailler
1. Autonomie : enchaîner les étapes. Fin d'étape = tests + point de 3 lignes (fait / testé / suite) dans la conversation **et** dans SUIVI.md + commit poussé.
2. S'arrêter **uniquement** pour : action imprévue que seule l'utilisatrice peut faire (la guider écran par écran puis vérifier) ; décision métier bloquante non tranchée (sinon : appliquer la recommandation et l'ajouter aux « Décisions à confirmer ») ; action irréversible (suppression, écrasement, envoi d'email, écriture SharePoint ou dans l'Excel d'origine) ; dépense IA > 5 $ en une fois ou hausse des coûts mensuels ; jalons A, B, C, D.
3. Questions groupées : 5 maximum, chacune avec une réponse recommandée par défaut.
4. Langage simple ; tout terme technique est défini en une phrase la première fois.
5. **Secrets** : jamais demandés dans la conversation, jamais affichés, jamais dans le code, Git ou les journaux. Saisie directe par l'utilisatrice dans l'environnement cloud Claude Code, Vercel, Supabase. Rappeler que l'environnement cloud est visible par quiconque peut le modifier.
6. Échantillon d'abord (10 à 20 éléments) pour tout traitement, vérifié par tests automatiques.
7. Tenir CLAUDE.md et SUIVI.md à jour à chaque fin d'étape.
8. Un commit clair par étape, poussé. Fin de session : résumé en 3 lignes + prochaine étape.
9. Signaler avant d'agir toute demande qui contredit le brief ou augmente nettement les coûts.
10. **Mises en ligne** : carte blanche (tout faire et mettre en ligne sans redemander) **la nuit du 18 au 19/11/2026, jusqu'au 19/11/2026 10 h** ; **ensuite, redemander son accord** avant chaque mise en ligne (elle reprend la main). Une capture accompagne le compte rendu des changements visuels. Ne jamais commencer un nouveau chantier sans son accord. Ne jamais lancer les tests de bout en bout (copie branchée sur la vraie base) pendant qu'elle travaille.
11. **Quand l'utilisatrice pose une question, y répondre d'abord, littéralement, sans rien modifier.** N'agir qu'ensuite, si elle le demande.
12. Elle veut avancer **vite** : réponses courtes, pas de détours.

## 3. Architecture (outils autorisés, aucun autre sans accord)
| Brique | Outil |
|---|---|
| Code | GitHub, dépôt privé `unitechsolutionsfr/ats-unitechsolutions` |
| Interface | Next.js (TypeScript) sur Vercel (https://ats-unitechsolutions.vercel.app), région **Londres `lhr1`** depuis le 17/11/2026 (à côté de la base : une requête à la base passe de 50-110 ms depuis Paris à 22-39 ms) |
| Base | Supabase Pro, projet `ats-unitech` (réf. `vobarkpycakqoivzlvck`), région **Londres `eu-west-2`** (décision du 9/11/2026 ; Royaume-Uni = adéquation RGPD) : Postgres, Auth, plein texte, pgvector |
| Fichiers | SharePoint (inchangé) via Microsoft Graph. Site `https://unitechsolutions578.sharepoint.com/sites/Recrutement2` (ID Graph `unitechsolutions578.sharepoint.com,756ac4dc-8c49-4a55-b473-7d4a3a0136a4,8cb5cc74-d24f-4e43-8117-e5405752db48`), bibliothèque « Documents partagés », dossier des CV `General/0 - Recrutement/Consultant/CV Consultants` (un sous-dossier par métier). Application Entra « ATS Unitech – Synchronisation » : client `598431b6-1f0a-4744-ac75-391f3cf3b369`, tenant `8198d0ba-4442-4cab-9367-0177ac7c53e8`, accès `Sites.Selected` en lecture sur ce seul site. |
| IA | API Anthropic, uniquement pour structurer CV et missions |
| Missions | **Trello** (autorisé le 16/11/2026), tableau « new tab UTS 2027 » (`YI6w9P5e`), **lecture seule** (jeton `scope=read`, variables `TRELLO_API_KEY` / `TRELLO_TOKEN` dans Vercel). Trello fait foi pour les missions : plus de création dans l'outil. Lu toutes les heures (`/api/cron/trello`) + bouton « Actualiser depuis Trello ». L'outil n'écrit jamais dans Trello. |

- **Sources de vérité** : Supabase = fiches ; SharePoint = fichiers (la base stocke identifiant SharePoint, texte extrait, empreinte SHA-256, jamais le fichier) ; l'Excel n'est lu **qu'une fois** depuis une copie .xlsx, jamais modifié. Export Excel = bouton réservé aux admins.
- **Module IA unique** `lib/ai` (fonctions `extraireProfilCV`, `extraireExigencesMission`, `trierEmail`, …). Identifiants de modèles dans **un seul fichier de configuration**.
- **Fonction d'ingestion unique** pour email et SharePoint (réutilisée par la future API jobboard V2).
- Branches → aperçu Vercel ; étape terminée et testée → fusion dans `main` (production). Après mise en service, une fusion qui touche la base ou les accès = point d'arrêt.
- Rien ne tourne sur l'ordinateur de l'utilisatrice.

## 4. IA et coûts
- Budget IA : ~25 $ pour l'import initial, < 15 $/mois ensuite. Plafond mensuel configurable (25 $ par défaut) dans l'app ; table `ai_usage`.
- Modèles autorisés : `claude-haiku-5-5` (tri emails, fiche CV, mission), `claude-sonnet-5-5` (repli unique si fiche Haiku invalide ; « analyse approfondie » sur clic). **Jamais Opus, Fable ou Mythos.**
- **Matching hybride** (décision du 17/11/2026, remplace le tri des 30 et la liste de métiers) : présélection par le **sens** (empreintes Voyage AI `voyage-4-large`, multilingue, tables `empreintes_consultants` / `empreintes_missions`, clé `VOYAGE_API_KEY` dans Vercel, 200 M de jetons gratuits) fusionnée avec la présélection par **compétences exactes** (fusion des rangs) ; Haiku lit la mission et les **60 premiers** (sans nom ni coordonnées) et donne **une note /100 + raison** (`lib/matching/hybride.ts`, `avis_matching.note`, gardée tant que la mission ne change pas : seuls les nouveaux entrants sont lus) ; les décisions de l'équipe (appelé, envoyé, retenu, refusé) sont données en exemples. Coût ≈ 0,01 $ par mission.
- Règles : pas de retraitement si empreinte + `prompt_version` inchangées ; delta Graph ; un appel par CV (Word nominatif seulement, jamais le PDF anonymisé) ; texte extrait localement, tronqué à 30 000 caractères ; CV scannés listés, pas d'OCR par défaut ; Batch API pour import et nuit ; prompt caching (préfixe ≥ 512 tokens sur Haiku/Sonnet 5.5) ; JSON strict, `max_tokens` serré (4 000 fiche depuis le 19/11 : 1 500 coupait les CV longs ; 1 500 mission) ; embeddings gratuits (pas d'API payante).
- Haiku 5.5 et Sonnet 5.5 réfléchissent (« thinking ») par défaut, facturé comme sortie : régler `effort: "low"` (et désactiver le thinking sur Haiku) pour les extractions.
- Estimation et accord avant tout traitement > 5 $.

## 5. Règles métier
- **Trigramme** : 1re lettre du prénom + 2 premières du nom, majuscules, sans accents. Non unique, jamais un identifiant (UUID interne). Règle particules/prénoms composés : voir SUIVI.md (à confirmer).
- **Dédoublonnage** : email normalisé, puis téléphone E.164. Doublon = mise à jour + historique. Doute (même nom, coordonnées différentes) = alerte « doublon possible ».
- **Téléphones** : 9 chiffres commençant par 1-7 ou 9 → +33 ; 10 chiffres commençant par 0 → +33 ; +33/0033 → harmoniser ; sinon valeur brute + signalement. Affichage `06 12 34 56 78`. Export Excel : colonne texte.
- **Association Word ↔ PDF** : trigramme (+ fonction) → candidat unique = association ; plusieurs = similarité de texte locale (seuil calibré) ; aucun net = alerte + arbitrage en un clic. Association stockée par identifiants SharePoint.
- **Emails** : pièce jointe = document nominatif ; PDF anonymisé manuel en V1 (« PDF anonymisé manquant ») ; fichiers renommés selon la convention et déposés dans SharePoint ; non-candidatures classées à part ; on garde expéditeur/date/objet/ID, pas le contenu.
- **Missions Trello** : une mission n'entre dans l'outil **que par la colonne « Missions en cours »** (décision du 16/11/2026 ; les cartes des autres colonnes au premier import sont ignorées) ; une carte importée est ensuite suivie partout : « Missions en cours » (à répartir) et « Sourcing Anaelle / Amadou / M CISSE » = ouverte (recruteur affiché) ; Positionnement, Qualification, Soutenance à venir = chez le client ; Go, Mission terminée = pourvue ; Hold = en pause ; Traitée sans positionnement, No-go, archivée = fermée ; « Sourcing Kefi » ignorée. Client = titre avant le tiret, sinon description. Compétences tirées de la description + pièce jointe (lues ensemble, sans doublon, relues seulement si le texte change). Mission déjà créée dans l'outil = reliée par rapprochement souple (même client + mots du poste), montré dans l'aperçu.
- **TJM** : celui de la carte Trello est une donnée interne : affiché en lecture seule (toute l'équipe), **jamais utilisé pour le classement, jamais envoyé à un consultant** (V3 : l'envoi de la fiche de poste par email ne doit jamais inclure le TJM ; le PDF joint n'en contient pas).
- **Métier** : plus de liste de métiers fixée à l'avance (abandonnée le 17/11/2026) : l'IA juge le métier en lisant la mission et les profils.
- **Matching v2 (activé le 18/11/2026, réglage `matching_v2`)** : « la base cherche, l'IA départage ». L'IA lit chaque mission → métier générique + 0 à 3 critères obligatoires avec synonymes (`missions.criteres_matching`, corrigeables sur la mission, `criteres_par_equipe`) ; la base garde les profils dont le texte complet (CV + ligne Excel, `textes_consultants`) contient le métier et chaque critère (`profils_eligibles`, regex insensibles aux accents ; critères seuls si < 3) ; Haiku lit le CV COMPLET des 30 premiers éligibles (5 par appel) et doit dire si chaque critère est prouvé par une vraie expérience ; non prouvé → note plafonnée à 45 par l'outil ; profils proches montrés à part avec les critères absents ; qualité mesurée dans Santé (`qualite_matching`). ≈ 0,01 $ par mission (`lib/matching/criteres.ts`, `hybride.ts`).
- **Matching (17/11/2026)** : seuls les profils **pertinents** (note IA ≥ 60, `estPertinent`) sont affichés ; l'IA lit les 100 premiers ; une compétence « indispensable » absente n'écarte plus (score ×0,75 + alerte, l'IA tranche) ; une fiche créée/modifiée est comparée aux 5 missions les plus proches (`lib/matching/profil.ts`).
- **Matching** : filtres éliminatoires (dispo/lieu obligatoires) puis score /100 explicable, pondérations réglables (compétences pondérées, années, séniorité, disponibilité, proximité sémantique). Référentiel de compétences avec synonymes. Suivi : proposé → appelé → envoyé au client → retenu / refusé, avec historique. Nouvelle fiche = comparée aux missions ouvertes (seuil réglable).
- **Excel sans fin de transition** (17/11/2026) : l'Excel et SharePoint restent tenus à jour. Une case modifiée dans l'outil (fiche ou tableau) est écrite dans l'Excel la nuit **en remplaçant** la valeur (`excel_maj_en_attente.ecraser`) ; un changement de nom ou de trigramme renomme les fichiers SharePoint et met à jour le CV Unitech (`lib/consultants/propagation.ts`). Toutes les cases de la fiche sont modifiables.
- **Écran Consultants = liste de contacts** (décision du 19/11/2026) : la recherche porte uniquement sur les colonnes, jamais sur le texte des CV (pas de case, pas d'extrait) ; la recherche dans les CV se fait dans l'écran Recherche.
- **Tableau de suivi** : copie fidèle de l'Excel (tous les onglets, en-têtes et ordre d'origine, tables `tableau_onglets`/`tableau_lignes`) ; le 1er onglet est relié aux fiches et ses modifications mettent la fiche à jour. Ne jamais fusionner prénom et nom à l'affichage.
- **Interface** : menu latéral à gauche, charte « marque » dans `src/app/globals.css` (classes `carte`, `champ`, `bouton-primaire`, `bouton-secondaire`, `pastille`).
- **Disponibilité** : date de mise à jour affichée ; alerte si > 3 mois.

## 6. Sécurité et RGPD (dès la V1)
- Pas d'inscription publique ; invitation par un admin ; rôles **administrateur** et **recruteur** ; retrait d'accès en un clic ; 2FA sur tous les comptes d'administration.
- RLS sur **toutes** les tables, règles testées. Clés secrètes uniquement côté serveur.
- Microsoft : privilège minimal (`Sites.Selected` sur le seul site, accès limité à la seule boîte de candidatures).
- Journal d'accès (consultation, modification, export) ; toute suppression de consultant tracée.
- Purge après confirmation admin des candidats sans contact depuis 24 mois ; export et effacement par personne ; mention d'information des candidats ; consignes IA interdisant toute caractéristique protégée ; le score est une aide, jamais un refus automatique.

## 7. Jalons (attendre le feu vert)
A après l'étape 5 (associations Word-PDF) · B après l'étape 6 (modèle + coût de l'import) · C après l'étape 9 (matching sur 3 missions passées) · D avant l'étape 13 (revue sécurité/RGPD).

## 8. Hors périmètre V1 (ne pas bloquer plus tard)
API jobboard, génération auto du PDF anonymisé, OCR, envoi d'emails depuis l'outil, statistiques.
