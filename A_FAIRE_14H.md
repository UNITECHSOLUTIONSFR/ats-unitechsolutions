# Vos actions (il ne reste que celles-ci ; tout le reste est fait et en ligne)

Ordre conseillé. Je vous guide écran par écran pour chacune.

1. **Planificateur de secours** — 5 min. Supabase → projet ats-unitech → **Integrations → Vault** → **Add new secret** : nom `cron_secret`, valeur = celle de `CRON_SECRET` (Vercel → Settings → Environment Variables). Si elle est masquée, on en crée une nouvelle ensemble pour Vercel, GitHub et Supabase. Vérification : « ✓ Planificateur de secours actif » dans le Bilan du jour.
2. **Double authentification** — 2 min. Paramètres → Double authentification.
3. **Échéances des secrets** — 5 min. Paramètres → Échéances des secrets : date d'expiration du secret Microsoft (Entra → Inscriptions d'applications → ATS Unitech – Synchronisation → Certificats et secrets → « Expire »), dates de renouvellement des abonnements.
4. **CV Unitech : valider le rendu** — 10 min. SharePoint → General → 0 - Recrutement → Sauvegardes ATS → **Essais CV Unitech - version 2**. Si c'est bon : Paramètres → Analyse des CV → « Activer le dépôt dans les dossiers métier ».
5. **Décision téléphones** : correction automatique des « 33… » sans « + » et de la lettre O au lieu du zéro (68 numéros). Oui / non.
6. **Compte de test recruteur** : Paramètres → Utilisateurs → inviter une adresse de test (rôle recruteur), vérifier ensemble ce qu'elle voit.
7. **Jalons** : C (3 missions passées pour juger le matching), D (relecture de la note RGPD, adresse de contact des candidats).
8. **Emails (quand vous le décidez)** : autoriser l'envoi depuis la seule boîte `ats-candidatures@` dans Exchange (je fournis les commandes), puis `EMAILS_ENVOI_ACTIF=1` dans Vercel et un envoi test à 10 consultants lancé par vous.
9. **Facultatif** : récupérer les fichiers des 522 CV de l'ancien groupe recrutement@ (accès Microsoft à remettre quelques minutes).

Ensuite : **invitation des collaborateurs** (Paramètres → Utilisateurs).
