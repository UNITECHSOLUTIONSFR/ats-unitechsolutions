# Actions de l'utilisatrice (à voir ensemble)

1. **CV Unitech : valider le rendu** — 10 minutes
   - Ouvrir SharePoint → General → 0 - Recrutement → **Sauvegardes ATS → Essais CV Unitech - version 2** (le dossier « Essais CV Unitech » contient une première version, sans les puces losange : à ignorer) : 10 essais (Word + PDF), dont 5 avec l'« Adéquation à la mission » (RATP, BPCE).
   - Vérifier : mise en page, fidélité au CV d'origine (rien d'inventé), anonymisation du PDF.
   - Si c'est bon : Paramètres → Analyse des CV → **« Activer le dépôt dans les dossiers métier »**. Les CV générés iront alors dans le bon dossier métier, et les CV reçus par email seront traités chaque nuit (10 par nuit, ≈ 0,005 $ chacun).

2. **Module Emails : brancher l'envoi** (quand tu le décides)
   - Exchange : autoriser l'outil à **envoyer** depuis la seule boîte `ats-candidatures@` (je fournis les commandes, comme pour la lecture).
   - Vercel : variable `EMAILS_ENVOI_ACTIF=1`, puis un **envoi test à 10 consultants**, lancé par toi.

3. **Double authentification** : Paramètres → Double authentification (2 minutes).

4. **Décision à confirmer** : correction automatique des téléphones (« 33… » sans « + », lettre O au lieu du zéro) — 68 numéros corrigés.

5. **Avant d'inviter l'équipe** : inviter une adresse de test (rôle recruteur) et vérifier ensemble ce qu'elle voit.

6. **Jalons** : C (3 missions passées pour valider le matching), D (relecture de la note RGPD, adresse de contact des candidats).
