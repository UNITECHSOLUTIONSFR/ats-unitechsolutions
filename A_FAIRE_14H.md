# À voir ensemble à 14 h (actions de l'utilisatrice)

1. **Relance automatique des synchronisations (GitHub)** — 3 minutes
   - Pourquoi : les synchros Excel, CV et emails tournent seules la nuit et toutes les heures, sans moi.
   - Vercel → projet → Settings → Environment Variables : créer une nouvelle valeur pour `CRON_SECRET` (une longue suite aléatoire), enregistrer, puis redéployer.
   - GitHub → dépôt `ats-unitechsolutions` → Settings → Secrets and variables → Actions → New repository secret : nom `CRON_SECRET`, même valeur.
   - Mettre la même valeur dans le secret réseau de la session Claude (hôte ats-unitechsolutions.vercel.app).
   - Je vérifie ensuite le premier passage (onglet Actions du dépôt).

2. **Relance des disponibilités (fonctionnalité prête, désactivée)** — à valider avant tout envoi
   - Relire le message type et le filtre des destinataires (Paramètres → Relance des disponibilités, une fois activée).
   - Exchange : autoriser l'outil à **envoyer** des emails depuis la seule boîte `ats-candidatures@` (rôle « Application Mail.Send » + « Application Mail.ReadWrite », limité à cette boîte, comme pour la lecture). Je fournis les commandes.
   - Fonctionnement : **seul un administrateur déclenche un envoi**, dans l'application (Paramètres → Relance des disponibilités → « Lancer l'envoi »). L'envoi part aussitôt, par lots, jusqu'au bout. Rien n'est planifié et je ne peux lancer aucune campagne (une campagne non lancée par un admin n'est jamais envoyée).
   - Go pour : appliquer la migration 14 (nouvelles tables), activer l'interrupteur `RELANCE_DISPONIBILITE=1` dans Vercel, puis un **envoi test à 10 consultants** avant le reste.

3. **Décisions à confirmer**
   - Téléphones : une lettre « O » tapée à la place du zéro et « 33… » sans « + » sont désormais corrigés automatiquement (68 numéros corrigés).
   - Les 32 candidatures en erreur de l'historique du groupe ne peuvent plus être relues (droit Group.Read.All retiré, comme prévu) : on les laisse.

4. **Avant d'inviter l'équipe**
   - Test avec un compte recruteur : inviter une adresse de test (rôle recruteur) et vérifier ensemble ce qu'elle voit.
