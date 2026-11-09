# CLAUDE.md — Règles permanentes du projet ATS Unitech Solution

> Résumé opérationnel de `BRIEF.md` (la référence complète, à relire à chaque session).
> L'avancement et les décisions en attente sont dans `SUIVI.md`.

## 1. Contexte
- ATS interne (suivi et matching de candidats) pour Unitech Solution, porté par une personne **non développeuse**.
- Existant : fichier Excel de suivi (M365), ~2 000 CV dans SharePoint (Word nominatif + PDF anonymisé), 200 à 500 candidatures/mois.
- L'utilisatrice est **elle-même administratrice Microsoft 365** : les réglages Entra ID / Exchange / SharePoint se font avec elle, en pas-à-pas.
- **Périmètre V1 (décision du 6/11/2026)** : import Excel + CV SharePoint, synchro de nuit, mission saisie à la main + matching, interface, sécurité, mise en service. La **liaison email** (`recrutement@unitechsolutions.fr`, ancienne étape 11) est reportée en **phase 2**. En V1, accès SharePoint en **lecture seule**.
- Les CV SharePoint sont rangés **par métier** (un dossier par métier) ; CV reçus par email déposés dans le dossier métier détecté, sinon `À classer`.
- Connexion des équipes : comptes Microsoft 365 (fournisseur Azure de Supabase), réservée au groupe Entra « ATS – Utilisateurs ».
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
10. **Quand l'utilisatrice pose une question, y répondre d'abord, littéralement, sans rien modifier.** N'agir qu'ensuite, si elle le demande.
11. Elle veut avancer **vite** : réponses courtes, pas de détours.

## 3. Architecture (outils autorisés, aucun autre sans accord)
| Brique | Outil |
|---|---|
| Code | GitHub, dépôt privé `unitechsolutionsfr/ats-unitechsolutions` |
| Interface | Next.js (TypeScript) sur Vercel (https://ats-unitechsolutions.vercel.app), région Paris `cdg1` |
| Base | Supabase Pro, projet `ats-unitech` (réf. `vobarkpycakqoivzlvck`), région **Londres `eu-west-2`** (décision du 9/11/2026 ; Royaume-Uni = adéquation RGPD) : Postgres, Auth, plein texte, pgvector |
| Fichiers | SharePoint (inchangé) via Microsoft Graph. Site `https://unitechsolutions578.sharepoint.com/sites/Recrutement2` (ID Graph `unitechsolutions578.sharepoint.com,756ac4dc-8c49-4a55-b473-7d4a3a0136a4,8cb5cc74-d24f-4e43-8117-e5405752db48`), bibliothèque « Documents partagés », dossier des CV `General/0 - Recrutement/Consultant/CV Consultants` (un sous-dossier par métier). Application Entra « ATS Unitech – Synchronisation » : client `598431b6-1f0a-4744-ac75-391f3cf3b369`, tenant `8198d0ba-4442-4cab-9367-0177ac7c53e8`, accès `Sites.Selected` en lecture sur ce seul site. |
| IA | API Anthropic, uniquement pour structurer CV et missions |

- **Sources de vérité** : Supabase = fiches ; SharePoint = fichiers (la base stocke identifiant SharePoint, texte extrait, empreinte SHA-256, jamais le fichier) ; l'Excel n'est lu **qu'une fois** depuis une copie .xlsx, jamais modifié. Export Excel = bouton réservé aux admins.
- **Module IA unique** `lib/ai` (fonctions `extraireProfilCV`, `extraireExigencesMission`, `trierEmail`, …). Identifiants de modèles dans **un seul fichier de configuration**.
- **Fonction d'ingestion unique** pour email et SharePoint (réutilisée par la future API jobboard V2).
- Branches → aperçu Vercel ; étape terminée et testée → fusion dans `main` (production). Après mise en service, une fusion qui touche la base ou les accès = point d'arrêt.
- Rien ne tourne sur l'ordinateur de l'utilisatrice.

## 4. IA et coûts
- Budget IA : ~25 $ pour l'import initial, < 15 $/mois ensuite. Plafond mensuel configurable (25 $ par défaut) dans l'app ; table `ai_usage`.
- Modèles autorisés : `claude-haiku-5-5` (tri emails, fiche CV, mission), `claude-sonnet-5-5` (repli unique si fiche Haiku invalide ; « analyse approfondie » sur clic). **Jamais Opus, Fable ou Mythos.**
- Règles : pas de retraitement si empreinte + `prompt_version` inchangées ; delta Graph ; un appel par CV (Word nominatif seulement, jamais le PDF anonymisé) ; texte extrait localement, tronqué à 30 000 caractères ; CV scannés listés, pas d'OCR par défaut ; Batch API pour import et nuit ; prompt caching (préfixe ≥ 512 tokens sur Haiku/Sonnet 5.5) ; JSON strict, `max_tokens` serré (≈1 500 fiche, 600 mission) ; **matching sans IA** ; embeddings gratuits (pas d'API payante).
- Haiku 5.5 et Sonnet 5.5 réfléchissent (« thinking ») par défaut, facturé comme sortie : régler `effort: "low"` (et désactiver le thinking sur Haiku) pour les extractions.
- Estimation et accord avant tout traitement > 5 $.

## 5. Règles métier
- **Trigramme** : 1re lettre du prénom + 2 premières du nom, majuscules, sans accents. Non unique, jamais un identifiant (UUID interne). Règle particules/prénoms composés : voir SUIVI.md (à confirmer).
- **Dédoublonnage** : email normalisé, puis téléphone E.164. Doublon = mise à jour + historique. Doute (même nom, coordonnées différentes) = alerte « doublon possible ».
- **Téléphones** : 9 chiffres commençant par 1-7 ou 9 → +33 ; 10 chiffres commençant par 0 → +33 ; +33/0033 → harmoniser ; sinon valeur brute + signalement. Affichage `06 12 34 56 78`. Export Excel : colonne texte.
- **Association Word ↔ PDF** : trigramme (+ fonction) → candidat unique = association ; plusieurs = similarité de texte locale (seuil calibré) ; aucun net = alerte + arbitrage en un clic. Association stockée par identifiants SharePoint.
- **Emails** : pièce jointe = document nominatif ; PDF anonymisé manuel en V1 (« PDF anonymisé manquant ») ; fichiers renommés selon la convention et déposés dans SharePoint ; non-candidatures classées à part ; on garde expéditeur/date/objet/ID, pas le contenu.
- **Matching** : filtres éliminatoires puis score /100 explicable, pondérations réglables (compétences pondérées, années, séniorité, disponibilité, proximité sémantique). Référentiel de compétences avec synonymes. Suivi : proposé → appelé → envoyé au client → retenu / refusé, avec historique. Nouvelle fiche = comparée aux missions ouvertes (seuil réglable).
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
