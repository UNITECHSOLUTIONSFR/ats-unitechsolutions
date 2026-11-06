# SUIVI.md — Avancement du projet ATS Unitech Solution

Dernière mise à jour : 6 novembre 2026

## Où on en est
**Étape 0 — Cadrage** terminée : brief enregistré (`BRIEF.md`), règles du projet (`CLAUDE.md`), guide de préparation (`GUIDE_PREPARATION.md`).
**En attente** : que tu suives `GUIDE_PREPARATION.md` (parties 1 à 6) et que tu répondes aux trois questions ci-dessous. Ensuite je démarre l'étape 1.

## Plan des 13 étapes

| # | Étape | Statut | Jalon |
|---|---|---|---|
| 0 | Cadrage (brief, règles, guide de préparation) | ✅ Terminé | |
| 1 | Préparation des comptes (vérification du guide) | ⏳ En attente de toi | |
| 2 | Squelette en ligne (Next.js + connexion + Vercel) | ⬜ À faire | |
| 3 | Base de données (schéma, RLS, rôles, référentiel) | ⬜ À faire | |
| 4 | Import du fichier Excel de suivi | ⬜ À faire | |
| 5 | Connexion SharePoint + association Word-PDF sur 20 consultants | ⬜ À faire | **Jalon A** |
| 6 | Structuration IA : comparatif Haiku / Sonnet + estimation | ⬜ À faire | **Jalon B** |
| 7 | Import complet des ~2 000 CV (Batch API) | ⬜ À faire | |
| 8 | Interface principale + administration + export Excel | ⬜ À faire | |
| 9 | Matching des missions + suivi des propositions | ⬜ À faire | **Jalon C** |
| 10 | Synchronisation nocturne + rapport du matin | ⬜ À faire | |
| 11 | Candidatures par email | ⬜ À faire | |
| 12 | Sécurité et RGPD (revue complète) | ⬜ À faire | **Jalon D** |
| 13 | Mise en service (guides, restauration, invitation) | ⬜ À faire | |

## Journal des étapes
### Étape 0 — Cadrage (6 novembre 2026)
- **Fait** : BRIEF.md, CLAUDE.md, SUIVI.md, GUIDE_PREPARATION.md ; tarifs et identifiants des modèles vérifiés dans la documentation officielle Anthropic.
- **Testé** : rien à tester (aucun code).
- **Ensuite** : tu suis le guide de préparation ; je vérifie chaque point puis je démarre l'étape 1.

## Questions en attente (à toi)
1. La boîte de candidatures est-elle bien dans Microsoft 365, et as-tu accès à l'administration Microsoft 365 ou faut-il passer par quelqu'un ? *Recommandation : boîte partagée M365 (gratuite) ; demande à l'administrateur avec le texte prêt du guide.*
2. Les ~2 000 CV sont-ils dans un seul site SharePoint, et comment sont rangés les dossiers ? *Recommandation : un seul site, que l'application pourra seule lire.*
3. Les équipes se connectent-elles avec leur compte Microsoft 365 ? *Recommandation : oui (pas de mot de passe de plus, départ d'un salarié = accès coupé automatiquement côté Microsoft).*

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
| D8 | **Haiku et Sonnet 5.5** : thinking désactivé ou `effort: low` pour les extractions. | La réflexion est facturée comme sortie ; inutile pour de l'extraction. |

## Coûts IA réels
| Date | Traitement | Coût réel |
|---|---|---|
| — | — | 0 $ |
