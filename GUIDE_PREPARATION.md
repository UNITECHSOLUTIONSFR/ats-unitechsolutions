# Guide de préparation — ATS Unitech Solution

Ce document regroupe **tout ce que tu auras à faire toi-même** pendant le projet. Suis les parties 1 à 6 en une fois (environ **3 h de ton temps**, plus le délai de réponse de l'administrateur Microsoft 365). Les actions qui ne peuvent être faites que plus tard sont regroupées dans la **partie 7**, avec l'étape concernée.

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

## Partie 3 — La demande à l'administrateur Microsoft 365 — ⏱ 10 min pour toi (+ 1 à 2 h pour l'administrateur)

**Pourquoi ?** L'application doit pouvoir lire les CV du site SharePoint, y déposer les CV reçus par email, lire la boîte de candidatures, et permettre à tes équipes de se connecter avec leur compte Microsoft. Pour la sécurité, on demande **le strict minimum** : un seul site SharePoint et une seule boîte, pas tout le tenant.

**Avant d'envoyer** : remplace les trois éléments entre crochets (adresse du site SharePoint, adresse de la boîte de candidatures, identifiant Supabase de la partie 1.3).

> **Objet : Création de deux applications Entra ID pour notre outil de recrutement (accès limité)**
>
> Bonjour,
>
> Nous mettons en place un outil interne de suivi des candidats (ATS). Il a besoin d'accéder à Microsoft 365 avec des droits strictement limités. Pourrais-tu réaliser les actions suivantes ?
>
> **A. Boîte de candidatures**
> 1. Créer une **boîte aux lettres partagée** (gratuite, sans licence) : nom affiché « Candidatures Unitech », adresse **[candidatures@unitechsolutions.fr]** (Centre d'administration Microsoft 365 → Équipes et groupes → Boîtes aux lettres partagées → Ajouter). M'en donner l'accès en tant que membre.
>    *(Si une adresse existante doit être utilisée à la place, merci de me l'indiquer.)*
>
> **B. Application n° 1 : « ATS Unitech – Synchronisation »** (accès sans utilisateur, pour SharePoint et la boîte)
> 1. Entra ID → Inscriptions d'applications → **Nouvelle inscription** : nom « ATS Unitech – Synchronisation », **comptes de cet annuaire uniquement**, sans URI de redirection.
> 2. **Autorisations d'API** → Microsoft Graph → **Autorisations d'application** → ajouter uniquement **Sites.Selected** → **Accorder le consentement administrateur**.
>    ⚠️ Ne pas ajouter Mail.Read, Sites.Read.All ni Files.Read.All dans Entra : ces droits s'appliqueraient à tout le tenant.
> 3. Donner à l'application l'accès en **écriture** au **seul** site **[https://unitechsolutions.sharepoint.com/sites/NOM-DU-SITE]**, par exemple avec PnP PowerShell :
>    ```powershell
>    Grant-PnPAzureADAppSitePermission -AppId <ID d'application> -DisplayName "ATS Unitech – Synchronisation" -Site "[URL du site]" -Permissions Write
>    ```
>    *(ou via Graph : `POST /sites/{site-id}/permissions` avec `{"roles":["write"],"grantedToIdentities":[{"application":{"id":"<ID d'application>","displayName":"ATS Unitech – Synchronisation"}}]}`)*
>    L'écriture sert uniquement à déposer les CV reçus par email ; l'outil ne supprime jamais de fichier.
> 4. Limiter l'accès mail à la **seule** boîte de candidatures avec le contrôle d'accès Exchange « RBAC for Applications » :
>    ```powershell
>    Connect-ExchangeOnline
>    New-ServicePrincipal -AppId <ID d'application> -ObjectId <ID d'objet de l'application d'entreprise> -DisplayName "ATS Unitech – Synchronisation"
>    New-ManagementScope -Name "ATS - Boite candidatures" -RecipientRestrictionFilter "PrimarySmtpAddress -eq '[candidatures@unitechsolutions.fr]'"
>    New-ManagementRoleAssignment -App <ID d'application> -Role "Application Mail.Read" -CustomResourceScope "ATS - Boite candidatures"
>    Test-ServicePrincipalAuthorization -Identity <ID d'application> -Resource [candidatures@unitechsolutions.fr]
>    ```
>    Le test doit renvoyer **InScope = True** pour cette boîte (et False pour une autre boîte, si tu peux le vérifier).
>
> **C. Application n° 2 : « ATS Unitech – Connexion »** (connexion des salariés avec leur compte Microsoft)
> 1. Nouvelle inscription : nom « ATS Unitech – Connexion », **comptes de cet annuaire uniquement**, URI de redirection de type **Web** : `https://[IDENTIFIANT-SUPABASE].supabase.co/auth/v1/callback`
> 2. Autorisations Microsoft Graph **déléguées** : `openid`, `email`, `profile`, `User.Read` uniquement → **Accorder le consentement administrateur**.
> 3. Entra ID → **Applications d'entreprise** → « ATS Unitech – Connexion » → **Propriétés** → **Affectation requise : Oui**. Puis **Utilisateurs et groupes** → affecter un groupe **« ATS – Utilisateurs »** (à créer) contenant pour l'instant uniquement moi. Ainsi, seules les personnes du groupe peuvent se connecter, et retirer quelqu'un du groupe lui coupe l'accès.
>
> **D. Secrets**
> Merci de **m'ajouter comme propriétaire** des deux inscriptions d'applications (Inscriptions d'applications → l'application → Propriétaires → Ajouter). Je créerai moi-même les secrets client, pour qu'ils ne circulent ni par email ni par Teams.
>
> **E. Merci de me renvoyer**
> - l'**ID de l'annuaire (tenant)** ;
> - l'**ID d'application (client)** de chacune des deux applications ;
> - la confirmation du consentement administrateur sur les deux applications ;
> - l'adresse exacte du site SharePoint autorisé et le résultat du `Test-ServicePrincipalAuthorization` ;
> - l'adresse de la boîte de candidatures ;
> - la confirmation que je suis propriétaire des deux applications et que le groupe « ATS – Utilisateurs » est créé.
>
> Aucun de ces éléments n'est secret : tu peux me les envoyer par email.
>
> Merci beaucoup !

**Quand l'administrateur a répondu** — ⏱ 10 min :
1. Va sur https://entra.microsoft.com → **Applications → Inscriptions d'applications → Toutes les applications** → « ATS Unitech – Synchronisation ».
2. **Certificats & secrets → Nouveau secret client** : description `ats-synchro`, expiration **24 mois** → **Ajouter**. Copie immédiatement la **Valeur** (pas l'« ID du secret ») dans ton gestionnaire de mots de passe, en notant la date d'expiration.
3. Fais de même pour « ATS Unitech – Connexion » (description `ats-connexion`).

✅ **Vérification** : tu as reçu les éléments de la liste E, et deux secrets sont rangés avec leur date d'expiration. Envoie-moi dans la conversation la liste E (non secrète).
- [ ] Demande envoyée
- [ ] Réponse reçue (liste E) et transmise dans la conversation
- [ ] Deux secrets client créés et rangés (date d'expiration notée)

---

## Partie 4 — La boîte de candidatures — ⏱ 5 min

La création est incluse dans la demande de la partie 3 (point A). Ce qu'il faut savoir :
- **Boîte partagée recommandée** (ex. `candidatures@unitechsolutions.fr`) : gratuite, plusieurs personnes peuvent la consulter dans Outlook, et l'outil n'a accès qu'à elle.
- **Adresse existante** (ex. `recrutement@…`) : possible si c'est déjà une boîte dédiée aux candidatures. Évite une boîte personnelle : l'outil y lirait aussi des emails privés.
- Annonce la nouvelle adresse sur tes offres d'emploi seulement à l'étape 11, quand le traitement automatique sera prêt.

✅ **Vérification** : dans Outlook sur le web, la boîte « Candidatures Unitech » apparaît dans la colonne de gauche (sinon : clic droit sur « Dossiers » → **Ajouter un dossier partagé**).
- [ ] Boîte de candidatures choisie et accessible

---

## Partie 5 — Les informations à me fournir — ⏱ 30 min

Ces informations ne sont pas secrètes ; donne-les-moi dans la conversation, **sauf le fichier Excel** (voir 5.3).

### 5.1 Chemins des dossiers SharePoint
Ouvre chaque dossier dans ton navigateur et copie l'adresse de la barre d'adresse :
- [ ] le dossier (ou les dossiers) des **Word nominatifs** ;
- [ ] le dossier (ou les dossiers) des **PDF anonymisés** ;
- [ ] le dossier où déposer les **CV reçus par email** (à créer si besoin, par exemple `CV/Candidatures email`).

Dis-moi aussi comment c'est rangé : tout dans un dossier, un sous-dossier par métier, par année, par personne…

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
- [ ] Indiqué en 5.1 (3e point)

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
| Étape 13 | Ajouter l'équipe au groupe « ATS – Utilisateurs » (via l'administrateur M365) et l'inviter dans l'application ; participer au test de restauration de sauvegarde. | 30 min |
| Tous les 24 mois | Renouveler les deux secrets client Microsoft avant leur expiration (procédure dans `GUIDE_EXPLOITATION.md`). Mets dès maintenant un rappel dans ton agenda **un mois avant** la date notée en partie 3. | 15 min |
