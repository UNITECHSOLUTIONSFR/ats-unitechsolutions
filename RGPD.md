# RGPD — ATS Unitech Solutions

> **À valider par la responsable du traitement (jalon D).** Projet rédigé le 10 novembre 2026, à compléter (cases « à compléter »).

## 1. Mention d'information des candidats

À ajouter dans la réponse automatique de la boîte recrutement@, sur la page carrières et en pied des emails de recrutement :

> **Protection de vos données personnelles.** Unitech Solutions traite les informations de votre candidature (identité, coordonnées, CV, échanges) afin de gérer votre candidature et de vous proposer des missions correspondant à votre profil. Ce traitement repose sur notre intérêt légitime à recruter et sur les mesures précontractuelles prises à votre demande. Vos données sont accessibles aux seules équipes recrutement d'Unitech Solutions. Elles sont hébergées dans l'Union européenne et au Royaume-Uni (pays reconnu par l'Union européenne comme offrant un niveau de protection adéquat) ; une partie du texte de votre CV est analysée par un service d'intelligence artificielle (Anthropic) pour en extraire vos compétences, sans décision automatique : chaque proposition est faite par une personne. Vos données sont conservées 2 ans après notre dernier contact, puis supprimées. Vous pouvez y accéder, les faire rectifier ou effacer, vous opposer à leur traitement ou en demander la limitation en écrivant à **[adresse à compléter, ex. rgpd@unitechsolutions.fr]**. Vous pouvez également saisir la CNIL (www.cnil.fr).

## 2. Fiche de registre des traitements (article 30 du RGPD)

| Rubrique | Contenu |
|---|---|
| Nom du traitement | Gestion des candidatures et des consultants (ATS interne) |
| Responsable du traitement | Unitech Solutions — [adresse, SIREN à compléter] — représentant : [à compléter] |
| Délégué à la protection des données | [à compléter, ou « non désigné »] |
| Finalités | Suivi des candidats et consultants ; recherche de profils pour les besoins des clients (matching) ; suivi des propositions |
| Base légale | Intérêt légitime (recrutement) ; mesures précontractuelles |
| Personnes concernées | Candidats, consultants |
| Données traitées | Identité, coordonnées (email, téléphone), trigramme, CV et texte extrait, compétences, expérience, disponibilité, TJM / prétentions, localisation, notes de suivi, historique des propositions, métadonnées des emails reçus (expéditeur, date, objet) |
| Données exclues | Aucune donnée sensible : l'IA a pour consigne de ne jamais extraire âge, sexe, origine, nationalité, situation familiale, santé, handicap, religion, opinions ou apparence |
| Destinataires | Équipes recrutement d'Unitech Solutions (comptes nominatifs, rôles administrateur / recruteur). Clients : uniquement le CV anonymisé, transmis par un recruteur |
| Sous-traitants | Supabase (base de données, Royaume-Uni — Londres) ; Vercel (hébergement de l'application, Paris) ; Anthropic (analyse du texte des CV et des fiches de poste — États-Unis, clauses contractuelles types ; les données de l'API ne servent pas à entraîner les modèles) ; Microsoft 365 (SharePoint, messagerie) |
| Transferts hors UE | Royaume-Uni (décision d'adéquation) ; États-Unis pour Anthropic (clauses contractuelles types) |
| Durée de conservation | 24 mois après le dernier contact pour les candidats ; durée de la relation + 24 mois pour les consultants ; purge proposée chaque mois et confirmée par un administrateur |
| Mesures de sécurité | Accès sur invitation uniquement ; deux rôles ; retrait d'accès en un clic ; règles d'accès en base (RLS) sur toutes les tables ; clés secrètes côté serveur uniquement ; accès Microsoft limité au seul site SharePoint (lecture) et à la seule boîte ATS Candidatures (lecture) ; journal des consultations, modifications, exports et suppressions ; sauvegardes quotidiennes ; double authentification sur les comptes d'administration |
| Droits des personnes | Export de toutes les données d'une personne et effacement en un clic (fiche consultant, administrateurs) ; liste des fichiers SharePoint à supprimer à la main fournie après effacement |
| Décision automatisée | Aucune : le score de matching est une aide à la décision, jamais un refus automatique |

## 3. Procédures dans l'outil

- **Droit d'accès** : fiche du consultant → « Exporter toutes ses données » (fichier JSON). L'export est journalisé.
- **Droit à l'effacement** : fiche du consultant → saisir le trigramme → « Effacer définitivement ». Supprimer ensuite à la main les fichiers SharePoint listés.
- **Purge à 24 mois** : Paramètres → « RGPD : purge à 24 mois » → vérifier la liste → saisir SUPPRIMER. À faire une fois par mois.
- **Rectification** : directement dans la fiche ; chaque modification est historisée.
