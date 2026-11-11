# ATS Unitech Solutions — guide d'une page

**Adresse :** https://ats-unitechsolutions.vercel.app — saisissez votre email professionnel : un lien de connexion vous est envoyé (pas de mot de passe). Les administrateurs ayant activé la double authentification saisissent ensuite le code à 6 chiffres de leur application.

## Tableau de bord
- **Mes missions** ouvertes, avec les 3 meilleurs profils de chacune et le nombre de **profils à 80+ à appeler**.
- **Nouveaux profils · 7 derniers jours** (emails, SharePoint, saisie) : un clic ouvre la fiche.
- **À relancer** : consultants proposés, appelés ou envoyés au client sans suite depuis 7 jours.
- **À vérifier** : les cas à traiter (doublons possibles, téléphones, CV illisibles…).
- **Bilan du jour** (administrateurs) : tâches automatiques (OK, en retard, échec), échéances des secrets à moins de 30 jours, consommation de l'IA (jour, 7 jours, mois). Les dates des secrets se saisissent dans Paramètres › Échéances des secrets.

## Recherche (en conversation)
Menu **Recherche** : décrivez le profil comme à un collègue (« un DevOps, 5-6 ans, Jenkins et Kubernetes, mobile sur Paris »), puis affinez (« sans Kubernetes », « plutôt 8 ans minimum », « qui a travaillé chez Orange »). Les critères compris s'affichent : un clic rend une compétence obligatoire ou souhaitée, ✕ la retire. À gauche, les filtres (score, expérience, lieu, statut, documents) mettent la liste à jour immédiatement. « Créer une mission à partir de cette recherche » reprend le texte. L'IA ne lit que votre phrase (environ 0,1 centime) ; le classement se fait sans IA. La disponibilité n'est pas prise en compte pour l'instant ; la **mobilité** se saisit sur la fiche.

## Trouver des consultants pour une mission
1. **+ Nouvelle mission** → importez la fiche du client (PDF ou Word) **ou** collez son texte → « Lire la fiche et pré-remplir ».
2. Vérifiez les champs (client, poste, lieu, démarrage, expérience) et les compétences : un clic rend une compétence **obligatoire** (foncée) ou **souhaitée** (claire) ; ✕ la retire ; vous pouvez en ajouter.
3. « Créer la mission » : les consultants s'affichent **classés par score sur 100**, avec l'évaluation critère par critère (✓ / ◐ / ✕).
4. Pour chaque consultant : appeler, écrire, CV Word, PDF anonymisé, et **suivi** : Proposé → Appelé → Envoyé au client → Retenu / Refusé.
5. **Préparer l'envoi au client** : un texte prêt à copier avec les profils anonymes (trigramme), leur disponibilité et le lien du PDF anonymisé. Les administrateurs peuvent **exporter le classement en Excel**.

Le score est une aide : c'est vous qui décidez. La personne qui crée une mission en est responsable ; un administrateur peut la réassigner.

## Consultants
- La recherche porte sur **toutes les colonnes**, les **compétences** et **le texte complet des CV** (« java paris », « kafka », « SNCF »).
- **Filtres rapides** : Disponibles maintenant · Dispo à vérifier (> 3 mois) · Ajoutés cette semaine · CV analysé. Onglets par **domaine**.
- **Clic sur une ligne** : la fiche s'ouvre à droite. **Word** = CV dans SharePoint, **CV reçu** = pièce jointe d'une candidature email (copiée dans SharePoint), **PDF** = CV anonymisé. Un badge « mot dans le CV » signale un résultat trouvé seulement dans le texte du CV (décochez « Chercher aussi dans les CV » pour l'exclure).
- **Double-clic sur une cellule** pour la modifier ; cochez plusieurs lignes pour modifier une colonne d'un coup ou copier les emails.
- **+** (en haut à droite) : nouveau consultant, nouvelle mission, export et import Excel (administrateurs).
- La fiche complète montre l'**historique** (modifications, emails, missions, CV) sur une frise.

## CV Unitech
Sur la fiche (bloc « CV Unitech ») ou sur un profil classé d'une mission : « Générer le Word et le PDF Unitech ». L'outil réécrit le CV (n'importe quel format) au modèle Unitech, avec la section **Adéquation à la mission** si une mission est choisie, puis dépose le Word nominatif et le PDF anonymisé dans SharePoint (sans jamais écraser un fichier). Les CV déjà générés restent listés sur la fiche (et sur la carte du profil dans la mission) : rouvrez-les sans nouvelle génération. Relisez-les avant envoi.

## Notes et statistiques
« Échanges de l'équipe » sur la fiche : une note datée et signée (« appelé, dispo mars »), visible par tous. Le menu **Statistiques** montre l'arrivée des profils, leurs sources et le suivi des propositions.

## Emails (administrateurs)
Onglets **Envois** (suivi), **Rédiger** (partir d'un modèle ou d'un email vierge → choisir les consultants → message → **Préparer** → **Lancer l'envoi**), **Modèles** (bibliothèque : utiliser, modifier, supprimer) et **Créer un modèle** (aperçu en direct, variables Prénom / Nom). Pour un email « Disponibilité », chaque réponse met à jour la fiche, le tableau et l'Excel automatiquement ; chaque email contient un lien de désinscription.

## Pendant la transition
Continuez à remplir le fichier Excel : il est relu chaque nuit et reçoit les fiches créées dans l'outil. Les CV déposés dans SharePoint (« UNITECH SOLUTIONS - CV Prénom Nom - Métier » et « … - CV TRI - … ») et les candidatures envoyées à recrutement@ sont traités automatiquement.

## Statuts
**Candidat** : toute personne du vivier (l'Excel ne contient que des candidats ; « CDI », « Freelance » y décrivent le contrat). **En mission** : déjà en mission, donc pas disponible pour nous. **Consultant** : uniquement saisi à la main dans l'outil. **Inactif** : marqué inactif, parti ou archivé.

## Pastilles
🟢 disponible ou retenu · 🟠 à vérifier · 🔴 alerte · ⚪ inactif

## Données personnelles
Ne copiez pas les données des candidats hors de l'outil. N'envoyez au client que le **PDF anonymisé**. Toute demande d'un candidat sur ses données est à transmettre à un administrateur.
