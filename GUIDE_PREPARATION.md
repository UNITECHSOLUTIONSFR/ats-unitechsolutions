# Guide de préparation — ATS Unitech Solution

Ce document regroupe **tout ce que tu auras à faire toi-même** pendant le projet. Suis les parties 1 à 6 en une fois (environ **4 h 30 de ton temps**, réglages Microsoft 365 compris). Les actions qui ne peuvent être faites que plus tard sont regroupées dans la **partie 7**, avec l'étape concernée.

Quand tu as terminé les parties 1 à 6, écris-moi simplement « Guide suivi » : je vérifierai chaque point moi-même.

> **Trois règles d'or pour les secrets** (mots de passe, clés API, « secrets client » Microsoft)
> 1. Ne les colle **jamais** dans la conversation avec moi, ni dans un email, ni dans Teams.
> 2. Tu les saisis **directement** dans l'écran indiqué (environnement cloud Claude Code, Vercel, Supabase, GitHub).
> 3. Range-les aussi dans un **gestionnaire de mots de passe** (Bitwarden, 1Password, ou celui de ton navigateur) : c'est ta copie de secours.
>
> Les informations **non secrètes** (adresses de sites, identifiants « Tenant ID » ou « Client ID », noms de fichiers) peuvent m'être données dans la conversation.

**Petit lexique**
- **Clé API** : un mot de passe qu'utilise un programme (et non une personne) pour accéder à un service.
- **Double authentification (2FA)** : en plus du mot de passe, un code à 6 chiffres affiché par une application sur ton téléphone (Microsoft Authenticator, par exemple).
- **Variable d'environnement** : un réglage (parfois secret) donné à un programme en dehors de son code, pour qu'il n'apparaisse jamais dans GitHub.
- **Tenant** : l'espace Microsoft 365 de ton entreprise.

---

## Récapitulatif des coûts (tarifs relevés le 6 novembre 2026)

| Service | Offre | Coût |
|---|---|---|
| GitHub | Organisation gratuite, dépôt privé | 0 € (2 000 min/mois d'automatisations incluses, largement suffisant) |
| Vercel | Pro, 1 siège | 20 $/mois |
| Supabase | Pro, 1 projet | 25 $/mois (inclut la puissance de calcul du plus petit serveur, suffisant ici) |
| API Anthropic | Paiement à l'usage (crédits prépayés) | Import initial estimé **2 à 5 $** avec Haiku 5.5 ; ensuite **1 à 3 $/mois** (estimation précise au jalon B) |
| Microsoft 365 | Existant ; boîte **partagée** de candidatures | 0 € (une boîte partagée ne demande pas de licence) |
| **Total** | | **≈ 47 à 50 $/mois** |

---

## Partie 1 — Les comptes et abonnements

### 1.1 GitHub : dépôt privé et alertes de sécurité — ⏱ 10 min
Le dépôt existe déjà : `unitechsolutionsfr/ats-unitechsolutions`.

1. Va sur https://github.com/unitechsolutionsfr/ats-unitechsolutions
2. Clique sur **Settings** (onglet en haut à droite du dépôt).
3. Tout en bas de la page **General**, rubrique **Danger Zone** : la ligne « Change repository visibility » doit indiquer **This repository is currently private**. Si ce n'est pas le cas, clique sur **Change visibility → Make private**.
4. Dans le menu de gauche, clique sur **Advanced Security** (ou **Code security** selon l'affichage).
5. Active (**Enable**) : **Dependency graph**, **Dependabot alerts**, **Dependabot security updates**. *(Dependabot = un robot GitHub qui te prévient si une bibliothèque utilisée par l'application a une faille connue.)*

✅ **Vérification** : un badge **Private** apparaît à côté du nom du dépôt ; les trois options Dependabot affichent « Disable » (ce qui veut dire qu'elles sont actives).
- [ ] Dépôt privé
- [ ] Alertes Dependabot activées

### 1.2 Vercel Pro — ⏱ 20 min
*(Vercel héberge l'application web et la met en ligne automatiquement à chaque modification.)*

1. Va sur https://vercel.com/signup et choisis **Continue with GitHub** (connecte-toi avec le compte GitHub qui gère le dépôt).
2. Choisis l'offre **Pro**, nomme l'équipe **Unitech Solution**, ajoute ta carte bancaire. Un seul siège (toi).
3. Une fois sur le tableau de bord : **Add New… → Project**.
4. Clique sur **Install** / **Adjust GitHub App Permissions** si demandé, choisis l'organisation `unitechsolutionsfr` puis **Only select repositories → ats-unitechsolutions** → **Install**.
5. De retour sur Vercel, clique sur **Import** à côté de `ats-unitechsolutions`. Laisse tout par défaut et clique sur **Deploy**. ⚠️ Ce premier déploiement va **échouer** (le dépôt ne contient pas encore d'application) : c'est normal.
6. Dans le projet : **Settings → Functions → Function Region** : choisis **Paris, France (cdg1)** → **Save**.
7. Dans **Settings → Deployment Protection** : laisse **Vercel Authentication** activé sur **Standard Protection** (les aperçus des branches restent privés).
8. Crée un jeton pour que je puisse configurer Vercel à ta place : clique sur ton avatar → **Account Settings → Tokens** → **Create**. Nom : `claude-code-ats`, Scope : **Unitech Solution**, Expiration : **1 year** → **Create**. Copie le jeton dans ton gestionnaire de mots de passe (il ne s'affiche qu'une fois). Tu le saisiras en partie 6.

✅ **Vérification** : le projet `ats-unitechsolutions` apparaît sur le tableau de bord, l'équipe affiche « Pro ».
- [ ] Vercel Pro souscrit
- [ ] Projet importé depuis GitHub, région cdg1
- [ ] Jeton Vercel créé et rangé

### 1.3 Supabase Pro en région UE — ⏱ 20 min
*(Supabase héberge la base de données, la connexion des utilisateurs et la recherche.)*

1. Va sur https://supabase.com/dashboard → **Continue with GitHub**.
2. **New organization** : nom **Unitech Solution**, type **Company**, plan **Pro** → ajoute ta carte bancaire.
3. Dans l'organisation : **Billing** → vérifie que **Spend Cap** (plafond de dépense) est **activé** : il empêche toute facturation au-delà des 25 $.
4. **New project** :
   - Name : `ats-unitech`
   - Database Password : clique sur **Generate a password**, copie-le dans ton gestionnaire de mots de passe.
   - Region : **West EU (Paris)** (à défaut **Central EU (Frankfurt)**).
   - Compute size : laisse **Micro** (inclus).
   - **Create new project** (2 minutes d'attente).
5. Note l'**identifiant du projet** (Project ref) : c'est la suite de lettres dans l'adresse de la page, `supabase.com/dashboard/project/`**`abcdefghijklmnop`**. *(Non secret : tu peux me le donner.)*
6. **Project Settings → API Keys** : tu y trouveras une **Publishable key** (`sb_publishable_…`, non secrète) et une **Secret key** (`sb_secret_…`, **secrète**). Si la secret key n'existe pas, clique sur **Create new API keys**. Ne copie rien pour l'instant : tu les saisiras en partie 6.
7. Crée un jeton personnel pour que je puisse créer les tables à distance : avatar en haut à droite → **Account preferences → Access Tokens** → **Generate new token**, nom `claude-code-ats`. Range-le dans ton gestionnaire de mots de passe.

✅ **Vérification** : le projet affiche « Healthy » et la région « eu-west-3 » (Paris) dans **Project Settings → General**.
- [ ] Organisation en plan Pro, Spend Cap activé
- [ ] Projet `ats-unitech` en région UE
- [ ] Mot de passe de la base rangé ; jeton personnel créé et rangé

### 1.4 Console Anthropic : paiement, clé API, plafond — ⏱ 20 min
*(Anthropic fournit l'IA Claude qui lit les CV et les missions.)*

1. Va sur https://platform.claude.com et crée un compte avec ton adresse professionnelle ; organisation : **Unitech Solution**.
2. **Settings → Billing** : ajoute ta carte, puis **Buy credits** : achète **15 $** de crédits. Laisse **Auto-reload** (rechargement automatique) **désactivé** : sans crédit, les appels s'arrêtent au lieu de facturer.
3. **Settings → Workspaces → Create workspace** : nom `ATS Unitech`. *(Un « workspace » est un compartiment qui regroupe les clés et les dépenses de ce projet.)*
4. Ouvre le workspace `ATS Unitech` → **Limits** : fixe une **limite de dépense mensuelle** de **40 $** pendant la construction (import compris). Je te dirai de la baisser à 20 $ après l'import.
5. **Settings → API Keys → Create Key**, dans le workspace `ATS Unitech` :
   - une clé nommée `ats-production` (pour Vercel et les automatisations) ;
   - une clé nommée `ats-claude-code` (pour mes tests dans la session).
   Chaque clé (`sk-ant-…`) ne s'affiche qu'une fois : range-les dans ton gestionnaire de mots de passe.

✅ **Vérification** : le solde de crédits apparaît dans **Billing**, la limite mensuelle du workspace est affichée, deux clés sont listées.
- [ ] Moyen de paiement et crédits
- [ ] Workspace `ATS Unitech` avec limite mensuelle
- [ ] Deux clés API créées et rangées

---

## Partie 2 — La double authentification partout — ⏱ 30 min

Installe d'abord **Microsoft Authenticator** sur ton téléphone (App Store ou Google Play). À chaque fois : scanne le QR code affiché, saisis le code à 6 chiffres, puis **range les codes de secours** dans ton gestionnaire de mots de passe.

| Compte | Écrans à suivre | Vérification | ✔ |
|---|---|---|---|
| **GitHub** | Avatar → **Settings → Password and authentication → Enable two-factor authentication** → *Authenticator app*. Puis, pour l'organisation : https://github.com/organizations/unitechsolutionsfr/settings/security → cocher **Require two-factor authentication** → **Save**. | La page indique « Two-factor authentication: Enabled ». | [ ] |
| **Vercel** | Avatar → **Account Settings → Authentication → Two-Factor Authentication → Enable** → *Authenticator app*. | Une reconnexion demande un code. | [ ] |
| **Supabase** | Avatar → **Account preferences → Security → Add new app** (Multi-factor authentication). Puis **Organization Settings** → active **Require MFA** si l'option est proposée. | « 1 app configured ». | [ ] |
| **Console Anthropic** | Avatar → **Profile / Security** : active l'authentification à deux facteurs si l'option est proposée. Si la console se connecte par lien envoyé par email ou par compte Google/Microsoft, c'est **ce compte email** qu'il faut protéger (ligne suivante). | Une reconnexion demande un second facteur. | [ ] |
| **Microsoft 365** | https://mysignins.microsoft.com/security-info → **Ajouter une méthode de connexion → Application d'authentification** → suivre l'assistant. | « Microsoft Authenticator » apparaît dans la liste des méthodes. | [ ] |

---

## Partie 3 — Microsoft 365 : réglages d'administration (c'est toi qui as les droits d'administration) — ⏱ 1 h 30

**Pourquoi ?** L'application doit pouvoir lire les CV du site SharePoint, y déposer les CV reçus par email, lire la boîte de candidatures, et laisser tes équipes se connecter avec leur compte Microsoft. Pour la sécurité, on donne **le strict minimum** : un seul site SharePoint et une seule boîte, pas tout le tenant.

**Ce que tu vas créer**
- une **boîte partagée** pour les candidatures (gratuite) ;
- un **groupe** « ATS – Utilisateurs » : seules les personnes de ce groupe pourront se connecter ;
- deux **inscriptions d'applications** dans Entra ID (Entra ID = l'annuaire Microsoft qui gère les comptes et les autorisations) :
  - « ATS Unitech – Synchronisation » : utilisée par l'outil, sans personne derrière, pour SharePoint et la boîte ;
  - « ATS Unitech – Connexion » : utilisée pour la connexion de tes équipes.

**Pré-requis** : la partie 1.3 (Supabase) est faite, car il te faut l'identifiant du projet Supabase pour le 3.6. Prépare un petit fichier texte (non secret) pour noter au fur et à mesure les **identifiants** demandés ; tu me le recopieras à la fin.

> **Coût** : 0 €. La connexion avec les comptes Microsoft est incluse dans Supabase Pro et dans ton abonnement Microsoft 365.

### 3.1 Créer la boîte partagée de candidatures — ⏱ 5 min
1. Va sur https://admin.microsoft.com (connecte-toi avec ton compte administrateur).
2. Menu de gauche : **Équipes et groupes → Boîtes aux lettres partagées** *(si le menu est replié : **Afficher tout**)*.
3. **+ Ajouter une boîte aux lettres partagée** :
   - Nom : `Candidatures Unitech`
   - Adresse e-mail : `candidatures` @ ton domaine (ex. `candidatures@unitechsolutions.fr`)
   - **Enregistrer les modifications**.
4. Sur l'écran suivant, clique sur **Ajouter des membres à cette boîte** → coche ton nom (et les recruteurs qui liront la boîte dans Outlook) → **Ajouter**.

✅ **Vérification** : dans Outlook sur le web (https://outlook.office.com), la boîte « Candidatures Unitech » apparaît dans la colonne de gauche après quelques minutes (sinon : clic droit sur **Dossiers → Ajouter un dossier partagé**).
- [ ] Boîte partagée créée — adresse notée : `________________`

*Une adresse existante (ex. `recrutement@…`) peut servir à la place, à condition qu'elle ne reçoive **que** des candidatures : l'outil lira tout ce qui y arrive. N'annonce la nouvelle adresse sur tes offres qu'à l'étape 11.*

### 3.2 Créer le groupe « ATS – Utilisateurs » — ⏱ 5 min
1. Toujours dans https://admin.microsoft.com : **Équipes et groupes → Équipes et groupes actifs** → onglet **Sécurité** → **+ Ajouter un groupe de sécurité**.
2. Nom : `ATS – Utilisateurs`, description : `Personnes autorisées à se connecter à l'ATS` → **Suivant** → **Créer le groupe**.
3. Ouvre le groupe → onglet **Membres** → **Afficher tous les membres et les gérer → + Ajouter des membres** → ajoute-toi (seulement toi pour l'instant).

✅ **Vérification** : le groupe apparaît dans l'onglet **Sécurité** avec 1 membre.
- [ ] Groupe créé, avec toi comme seul membre

### 3.3 Application « ATS Unitech – Synchronisation » — ⏱ 15 min
1. Va sur https://entra.microsoft.com → menu de gauche **Applications → Inscriptions d'applications** → **+ Nouvelle inscription**.
2. Nom : `ATS Unitech – Synchronisation` ; Types de comptes : **Comptes dans cet annuaire d'organisation uniquement** ; URI de redirection : **laisser vide** → **S'inscrire**.
3. Sur la page **Vue d'ensemble** qui s'affiche, note :
   - **ID d'application (client)** → « ID Synchro » ;
   - **ID de l'annuaire (locataire)** → « ID Tenant ».
4. Menu de l'application : **Autorisations de l'API**.
   - Sur la ligne existante **User.Read**, clique sur **…** → **Supprimer l'autorisation** → **Oui** (inutile ici).
   - **+ Ajouter une autorisation → Microsoft Graph → Autorisations d'application** → dans la recherche, tape `Sites.Selected` → coche **Sites.Selected** → **Ajouter des autorisations**.
   - Clique sur **Accorder un consentement d'administrateur pour [ton entreprise]** → **Oui**.
   - ⚠️ N'ajoute **rien d'autre** (surtout pas Mail.Read, Sites.Read.All, Files.Read.All : ces droits s'appliqueraient à **tout** ton Microsoft 365).
5. Menu de l'application : **Certificats & secrets → Secrets client → + Nouveau secret client** : description `ats-synchro`, expiration **24 mois** → **Ajouter**. Copie **immédiatement** la colonne **Valeur** (pas « ID du secret ») dans ton gestionnaire de mots de passe, avec la **date d'expiration**. Elle ne sera plus jamais affichée.
6. Va dans **Applications → Applications d'entreprise** → recherche `ATS Unitech – Synchronisation` → ouvre-la → **Vue d'ensemble** : note l'**ID d'objet** → « ID Objet Synchro » *(attention : c'est celui de l'« application d'entreprise », différent de celui de la page de l'étape 3)*.

✅ **Vérification** : dans **Autorisations de l'API**, une seule ligne **Sites.Selected — Application — Accordé pour…** avec une coche verte.
- [ ] Application créée, Sites.Selected accordé
- [ ] Secret `ats-synchro` rangé, date d'expiration notée
- [ ] Notés : ID Synchro, ID Tenant, ID Objet Synchro

### 3.4 Autoriser l'application sur **un seul** site SharePoint — ⏱ 15 min
*On utilise **Graph Explorer**, un outil web officiel de Microsoft qui permet d'envoyer des commandes à Microsoft 365 depuis le navigateur.*

1. Repère l'adresse du site qui contient les CV, par exemple `https://unitechsolutions.sharepoint.com/sites/Recrutement`. Il te faut deux morceaux : le **domaine** (`unitechsolutions.sharepoint.com`) et le **chemin** (`/sites/Recrutement`).
2. Ouvre https://developer.microsoft.com/graph/graph-explorer → **Se connecter** (en haut à droite) avec ton compte administrateur.
3. **Donner à Graph Explorer le droit de faire ce réglage** : clique sur ton avatar dans Graph Explorer → **Consentir aux autorisations** (ou onglet **Modifier les autorisations**) → recherche `Sites.FullControl.All` → **Consentir** → accepte (coche *consentement au nom de votre organisation* si proposé).
4. **Trouver l'identifiant du site** :
   - Méthode : **GET** ; adresse :
     ```
     https://graph.microsoft.com/v1.0/sites/unitechsolutions.sharepoint.com:/sites/Recrutement?$select=id,webUrl
     ```
     (remplace le domaine et le chemin par les tiens) → **Exécuter la requête**.
   - Dans la réponse, copie la valeur de `"id"` (de la forme `unitechsolutions.sharepoint.com,xxxx-…,yyyy-…`) → « ID Site ».
5. **Donner l'accès** :
   - Méthode : **POST** ; adresse :
     ```
     https://graph.microsoft.com/v1.0/sites/ID-SITE/permissions
     ```
     (remplace `ID-SITE` par l'ID Site).
   - Dans **Corps de la demande**, colle (en remplaçant `ID-SYNCHRO`) :
     ```json
     {
       "roles": ["write"],
       "grantedToIdentities": [
         { "application": { "id": "ID-SYNCHRO", "displayName": "ATS Unitech – Synchronisation" } }
       ]
     }
     ```
   - **Exécuter la requête**. Réponse attendue : **201 Created**.
   *Le droit « write » sert uniquement à déposer les CV reçus par email (étape 11). L'outil ne supprimera jamais de fichier, et toute écriture sera un point d'arrêt où je te demande l'accord.*
6. **Vérifier** : méthode **GET**, même adresse `…/sites/ID-SITE/permissions` → **Exécuter**. Tu dois voir une ligne avec `"roles": ["write"]` et le nom « ATS Unitech – Synchronisation ».
7. *(Hygiène, recommandé)* Retire ensuite à Graph Explorer ce droit très large : https://entra.microsoft.com → **Applications d'entreprise** → `Graph Explorer` → **Autorisations** → **Vérifier les autorisations** / supprimer `Sites.FullControl.All`. Si l'écran te semble compliqué, laisse : je te réexpliquerai au jalon D.

- [ ] Accès « write » donné au seul site — ID Site noté

### 3.5 Limiter l'accès mail à la **seule** boîte de candidatures — ⏱ 20 min
*Ce réglage ne se fait qu'en ligne de commande (PowerShell), une seule fois, depuis ton ordinateur. Ce n'est pas l'outil qui tourne chez toi : c'est juste un réglage d'administration ponctuel.*

**Sur Windows** :
1. Menu Démarrer → tape `PowerShell` → clic droit sur **Windows PowerShell** → **Exécuter en tant qu'administrateur** → **Oui**.
2. Copie-colle ces lignes une par une (Entrée après chacune ; réponds **O** ou **T** — Oui/Oui pour tout — aux questions d'installation) :
   ```powershell
   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
   Install-Module ExchangeOnlineManagement -Scope CurrentUser
   Connect-ExchangeOnline
   ```
   Une fenêtre de connexion Microsoft s'ouvre : connecte-toi avec ton compte administrateur.

**Sur Mac** : installe d'abord PowerShell (https://aka.ms/powershell-release?tag=stable, fichier `.pkg`), ouvre l'application **Terminal**, tape `pwsh` puis Entrée, et continue avec les trois lignes ci-dessus (sans la première).

3. Copie-colle ensuite ces quatre commandes **après avoir remplacé** `ID-SYNCHRO`, `ID-OBJET-SYNCHRO` et l'adresse de la boîte :
   ```powershell
   New-ServicePrincipal -AppId ID-SYNCHRO -ObjectId ID-OBJET-SYNCHRO -DisplayName "ATS Unitech - Synchronisation"
   New-ManagementScope -Name "ATS - Boite candidatures" -RecipientRestrictionFilter "PrimarySmtpAddress -eq 'candidatures@unitechsolutions.fr'"
   New-ManagementRoleAssignment -App ID-SYNCHRO -Role "Application Mail.Read" -CustomResourceScope "ATS - Boite candidatures"
   Test-ServicePrincipalAuthorization -Identity ID-SYNCHRO -Resource candidatures@unitechsolutions.fr
   ```
4. La dernière commande affiche un tableau : la colonne **InScope** doit valoir **True**.
5. Contre-vérification : relance la dernière commande en remplaçant l'adresse par **ta propre adresse** : InScope doit valoir **False** (l'outil ne peut pas lire ta boîte).
6. Tape `Disconnect-ExchangeOnline` puis ferme la fenêtre.

*Si une commande affiche un message en rouge, ne t'inquiète pas : copie le message (il ne contient aucun secret) et colle-le-moi dans la conversation.*
- [ ] InScope = True pour la boîte de candidatures
- [ ] InScope = False pour ta propre boîte

### 3.6 Application « ATS Unitech – Connexion » — ⏱ 15 min
1. https://entra.microsoft.com → **Applications → Inscriptions d'applications → + Nouvelle inscription**.
2. Nom : `ATS Unitech – Connexion` ; **Comptes dans cet annuaire d'organisation uniquement** ; URI de redirection : plateforme **Web**, adresse :
   ```
   https://IDENTIFIANT-SUPABASE.supabase.co/auth/v1/callback
   ```
   (remplace `IDENTIFIANT-SUPABASE` par l'identifiant noté en 1.3) → **S'inscrire**.
3. Note l'**ID d'application (client)** → « ID Connexion ».
4. **Autorisations de l'API → + Ajouter une autorisation → Microsoft Graph → Autorisations déléguées** → coche `openid`, `email`, `profile` (User.Read est déjà présent) → **Ajouter des autorisations** → **Accorder un consentement d'administrateur** → **Oui**.
5. **Certificats & secrets → + Nouveau secret client** : description `ats-connexion`, **24 mois** → **Ajouter** → copie la **Valeur** dans ton gestionnaire de mots de passe avec sa date d'expiration.
6. **Applications → Applications d'entreprise** → `ATS Unitech – Connexion` :
   - **Propriétés** → **Affectation requise ?** : **Oui** → **Enregistrer**. *(Sans cela, n'importe quel salarié du tenant pourrait tenter de se connecter.)*
   - **Utilisateurs et groupes → + Ajouter un utilisateur/groupe** → **Aucun sélectionné** → choisis le groupe **ATS – Utilisateurs** → **Sélectionner → Attribuer**.
   - *Si Microsoft ne te laisse choisir que des personnes et pas de groupe (cela demande l'option Entra ID P1, incluse dans Microsoft 365 Business Premium ou E3), ajoute-toi directement : on ajoutera les collègues un par un à l'étape 13. Pas besoin de payer l'option.*

✅ **Vérification** : 4 autorisations déléguées avec coche verte ; « Affectation requise : Oui » ; le groupe (ou ton nom) apparaît dans **Utilisateurs et groupes**.
- [ ] Application de connexion créée et réservée au groupe
- [ ] Secret `ats-connexion` rangé, date d'expiration notée
- [ ] ID Connexion noté

### 3.7 Ce que tu me renvoies dans la conversation (rien de secret)
```
ID Tenant         :
ID Synchro        :
ID Connexion      :
Adresse du site   :
ID Site           :
Boîte candidatures:
Résultat InScope  : True (boîte candidatures) / False (ma boîte)
Groupe assigné    : oui / non (utilisateurs un par un)
```
⚠️ **Jamais** les valeurs des secrets `ats-synchro` et `ats-connexion` : elles vont uniquement en partie 6.

Mets dès maintenant dans ton agenda un rappel **un mois avant** l'expiration des deux secrets (24 mois).

---

## Partie 4 — (fusionnée dans la partie 3.1)

La boîte de candidatures est créée en 3.1.

---

## Partie 5 — Les informations à me fournir — ⏱ 30 min

Ces informations ne sont pas secrètes ; donne-les-moi dans la conversation, **sauf le fichier Excel** (voir 5.3).

### 5.1 Chemins des dossiers SharePoint
Ouvre chaque dossier dans ton navigateur et copie l'adresse de la barre d'adresse :
- [ ] le **dossier parent** qui contient les dossiers par métier ;
- [ ] la **liste des dossiers métier** (ex. `Développeur`, `Chef de projet`, `Data`…) ;
- [ ] dans un dossier métier : les Word et les PDF sont-ils **ensemble**, ou dans deux sous-dossiers (ex. `Word` / `PDF`) ? Donne l'adresse d'un exemple ;
- [ ] y a-t-il des CV **hors** de ces dossiers métier (archives, anciens dossiers) ?

Le dossier de dépôt des CV reçus par email est traité en 5.5.

### 5.2 Dix vrais exemples de noms de fichiers
Copie **exactement** (espaces, virgules, tirets, majuscules) **10 noms de Word** et **les 10 PDF correspondants**. Choisis de préférence des cas difficiles :
- [ ] un prénom composé (Jean-Marc) ;
- [ ] un nom à particule (Le Goff, De La Tour, d'Artagnan) ;
- [ ] un nom avec accent ;
- [ ] deux personnes ayant le même trigramme ;
- [ ] une même personne avec deux fonctions ou deux versions de CV ;
- [ ] un fichier qui ne respecte pas la convention.

Je ne les mettrai pas tels quels dans GitHub : les tests automatiques utiliseront des noms inventés construits sur le même modèle.

### 5.3 La copie du fichier Excel de suivi (.xlsx)
1. Ouvre le fichier Excel de suivi dans Excel Online → **Fichier → Créer une copie → Télécharger une copie**.
2. Dépose ce fichier `.xlsx` dans un dossier `ATS-Import` **du site SharePoint autorisé** (partie 3). Je le lirai de là, sans jamais toucher au fichier d'origine.
   *Pourquoi pas dans la conversation ou dans GitHub ? Le fichier contient des données personnelles : il ne doit jamais entrer dans l'historique du code.*
   *(Cette action ne sera possible qu'une fois l'accès Microsoft en place ; je te le rappellerai à l'étape 4.)*
- [ ] Copie déposée dans `ATS-Import`

### 5.4 La liste des utilisateurs
Pour chaque personne : **prénom, nom, adresse Microsoft 365, rôle** (*administrateur* : réglages, utilisateurs, exports, purge ; *recruteur* : consultation, création, modification, matching).
- [ ] Liste envoyée

### 5.5 Le dossier de dépôt des candidatures email
Comme les CV sont rangés par métier, je propose : l'outil dépose chaque CV reçu par email dans le **dossier métier** correspondant au poste détecté, et dans un dossier **`À classer`** quand le métier n'est pas clair. Tu le déplaces ensuite à la main, et l'outil suit le fichier même déplacé.
- [ ] Crée un dossier `À classer` à côté des dossiers métier (ou dis-moi si tu préfères un seul dossier pour toutes les candidatures email).

---

## Partie 6 — Où saisir les secrets, et accès réseau de la session — ⏱ 30 min

### 6.1 Environnement cloud Claude Code (pour mes tests pendant la construction)
⚠️ **Toute personne qui peut modifier cet environnement peut voir ses réglages** : tu dois rester **la seule** à y avoir accès.

Ouvre le menu de l'environnement cloud dans la barre de titre de la session (sur claude.ai/code) → **Edit**.

**a) Accès réseau (Network access)** : choisis **Limited**, laisse cochée **Allow package managers** (bibliothèques de code), et ajoute **exactement** ces domaines dans **Allowed domains** :

| Domaine | À quoi il sert |
|---|---|
| `api.anthropic.com` | API Claude (IA) |
| `[IDENTIFIANT-SUPABASE].supabase.co` | ta base de données |
| `api.supabase.com` | création des tables et réglages Supabase à distance |
| `graph.microsoft.com` | SharePoint et boîte de candidatures |
| `login.microsoftonline.com` | connexion à Microsoft |
| `[TENANT].sharepoint.com` | téléchargement des fichiers CV (ex. `unitechsolutions.sharepoint.com`, la première partie de l'adresse de ton SharePoint) |
| `api.vercel.com` | configuration et suivi des mises en ligne |

**b) Secrets réseau (Network secrets)** — le plus sûr : la clé est ajoutée automatiquement aux requêtes vers le domaine indiqué, sans que je la voie. Pour chaque ligne, clique sur **Add** :

| Domaine (host) | En-tête (header) | Valeur |
|---|---|---|
| `api.anthropic.com` | `x-api-key` | la clé Anthropic **`ats-claude-code`** |
| `[IDENTIFIANT-SUPABASE].supabase.co` | `apikey` | la **Secret key** Supabase (`sb_secret_…`) |
| `api.supabase.com` | `Authorization` (préfixe `Bearer`) | le **jeton personnel** Supabase |
| `api.vercel.com` | `Authorization` (préfixe `Bearer`) | le **jeton Vercel** |

*Si la rubrique « Network secrets » n'existe pas dans ton application, utilise à la place des variables d'environnement portant les noms `ANTHROPIC_API_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_ACCESS_TOKEN`, `VERCEL_TOKEN`. Pendant le travail, je peux aussi t'afficher une carte sécurisée pour saisir une clé : c'est équivalent.*

**c) Variables d'environnement (Environment variables)** : une ligne par variable, au format `NOM=valeur` :
```
SUPABASE_URL=https://[IDENTIFIANT-SUPABASE].supabase.co
MS_TENANT_ID=[ID de l'annuaire]
MS_CLIENT_ID=[ID d'application « Synchronisation »]
MS_CLIENT_SECRET=[secret « ats-synchro »]
SHAREPOINT_SITE_URL=[URL du site]
```
*`MS_CLIENT_SECRET` est le seul secret à mettre ici : Microsoft l'exige dans le corps de la demande de connexion, ce que les « Network secrets » ne savent pas faire.*

✅ **Vérification** : dis-moi « Guide suivi » ; je testerai depuis la session chaque domaine et chaque clé sans jamais afficher leur valeur.
- [ ] Accès réseau limité aux 7 domaines
- [ ] 4 secrets réseau saisis
- [ ] 5 variables d'environnement saisies

### 6.2 Vercel (l'application en ligne)
**Projet `ats-unitechsolutions` → Settings → Environment Variables**. Pour chaque variable : saisis le nom et la valeur, coche **Production** et **Preview**, et active **Sensitive** pour les secrets (la valeur ne pourra plus être relue, même par toi).

| Nom | Valeur | Sensitive |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://[IDENTIFIANT-SUPABASE].supabase.co` | non |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | la **Publishable key** Supabase (`sb_publishable_…`) | non (elle est faite pour être publique) |
| `SUPABASE_SECRET_KEY` | la **Secret key** Supabase | **oui** |
| `ANTHROPIC_API_KEY` | la clé Anthropic **`ats-production`** | **oui** |
| `MS_TENANT_ID` | ID de l'annuaire | non |
| `MS_CLIENT_ID` | ID d'application « Synchronisation » | non |
| `MS_CLIENT_SECRET` | secret « ats-synchro » | **oui** |
| `CRON_SECRET` | une phrase aléatoire de 32 caractères générée par ton gestionnaire de mots de passe | **oui** |

*(Je pourrai ajouter moi-même les variables non secrètes grâce au jeton Vercel ; les secrets restent ta main.)*
- [ ] Variables Vercel saisies

### 6.3 Supabase (connexion avec les comptes Microsoft)
**Authentication → Sign In / Providers → Azure** → **Enable** :
- **Application (client) ID** : ID d'application « Connexion »
- **Secret Value** : secret « ats-connexion »
- **Azure Tenant URL** : `https://login.microsoftonline.com/[ID de l'annuaire]`
→ **Save**.
- [ ] Fournisseur Azure activé dans Supabase

---

## Partie 7 — Actions à faire plus tard (je te préviendrai)

| Étape | Action | Durée |
|---|---|---|
| Étape 2 | Te connecter à la page d'accueil en ligne avec ton compte Microsoft et me dire si cela fonctionne. | 2 min |
| Étape 4 | Déposer la copie `.xlsx` du fichier de suivi dans `ATS-Import` (partie 5.3), si ce n'est pas déjà fait. Puis lire le rapport d'import de test. | 5 min |
| Étape 5 | **Jalon A** : valider les associations Word-PDF de l'échantillon. | 20 min |
| Étape 6 | **Jalon B** : comparer les fiches Haiku / Sonnet, choisir le modèle, accepter ou non l'estimation de l'import complet. | 20 min |
| Étape 7 | Saisir dans GitHub les secrets de l'import automatique : dépôt → **Settings → Secrets and variables → Actions → New repository secret** : `ANTHROPIC_API_KEY` (clé `ats-production`), `SUPABASE_SECRET_KEY`, `MS_CLIENT_SECRET`. Puis, après l'import, baisser la limite mensuelle Anthropic à 20 $. | 10 min |
| Étape 9 | **Jalon C** : me fournir le texte de **trois missions passées** et le nom des consultants qui avaient été retenus ; vérifier le classement. | 30 min |
| Étape 11 | Activer la **réponse automatique** de la boîte de candidatures avec la mention RGPD que nous aurons rédigée (Outlook → boîte partagée → Paramètres → Réponses automatiques), puis annoncer l'adresse sur les offres d'emploi. | 10 min |
| Étape 12 | **Jalon D** : revue sécurité et RGPD ; tester l'application avec un compte « recruteur » (un collègue volontaire ajouté au groupe « ATS – Utilisateurs »). | 45 min |
| Étape 13 | Ajouter l'équipe au groupe « ATS – Utilisateurs » (partie 3.2) et l'inviter dans l'application ; participer au test de restauration de sauvegarde. | 30 min |
| Tous les 24 mois | Renouveler les deux secrets client Microsoft avant leur expiration (procédure dans `GUIDE_EXPLOITATION.md`). Mets dès maintenant un rappel dans ton agenda **un mois avant** la date notée en partie 3. | 15 min |
