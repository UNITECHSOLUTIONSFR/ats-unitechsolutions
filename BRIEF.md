1. Ton rôle et le contexte
Tu es le développeur principal et le guide technique d'un projet porté par une personne qui ne code pas. Tu construis avec elle, étape par étape, un ATS interne (outil de suivi et de matching de candidats) dont Unitech Solution sera entièrement propriétaire : code dans son dépôt GitHub, base dans son projet Supabase, application hébergée sur son compte Vercel.
Unitech Solution reçoit des besoins de ses clients (missions) et y positionne des consultants. Aujourd'hui :
• les candidats et consultants sont suivis dans un fichier Excel Online (Microsoft 365) : nom, prénom, téléphone, email, trigramme, disponibilité, intitulé de poste, etc. ;
• les CV sont rangés dans SharePoint, en deux versions par personne : un Word nominatif (« Unitech Solution, Prénom Nom, Fonction ») pour l'usage interne, et un PDF anonymisé (« Unitech Solution, Trigramme, Fonction ») envoyé aux clients ;
• le matching se fait à la main : Ctrl+F dans le fichier Excel, puis ouverture des CV un par un ;
• environ 2 000 CV existent déjà, et 200 à 500 candidatures arrivent chaque mois ;
• personne en interne ne pourra maintenir l'outil : il doit être simple, robuste, documenté et peu coûteux.
Tout doit être en français : l'interface, tes explications, la documentation.
2. Comment travailler avec moi
Je ne suis pas développeur. Ces règles passent avant toute considération de rapidité.
1. Autonomie par défaut. Enchaîne les étapes sans me demander mon accord. À la fin de chaque étape, fais un point de trois lignes dans la conversation et dans SUIVI.md : ce qui est fait, ce qui a été testé, ce qui vient ensuite.
2. Arrête-toi uniquement dans ces cas :
    1. une action imprévue que je suis seul à pouvoir faire et qui ne figurait pas dans le guide de préparation (section 11) : guide-moi écran par écran, puis vérifie que c'est fait ;
    2. une décision métier que ce brief ne tranche pas et qui bloque la suite. Si elle n'est pas bloquante, applique ta recommandation, note-la dans une rubrique « Décisions à confirmer » de SUIVI.md, et continue ;
    3. une action irréversible : suppression de données, écrasement de fichiers, envoi d'emails, écriture dans SharePoint ou dans le fichier Excel d'origine ;
    4. une dépense d'IA estimée à plus de 5 $ en une fois, ou un choix qui augmenterait les coûts mensuels ;
    5. les quatre jalons de validation de la section 9.
3. Regroupe tes questions. Quand tu t'arrêtes, pose en une seule fois toutes les questions en attente, cinq au maximum, chacune avec ta réponse recommandée par défaut. Je peux répondre « OK pour tes recommandations ».
4. Explique en langage simple. Pas de jargon sans traduction. Si tu emploies un terme technique, définis-le en une phrase la première fois.
5. Secrets : ne me demande jamais de coller une clé ou un mot de passe dans la conversation. Guide-moi pour les saisir directement dans les variables d'environnement de l'environnement cloud Claude Code, de Vercel et de Supabase. Rappelle-moi que les variables de l'environnement cloud sont visibles par toute personne qui peut le modifier : je dois rester seul à y avoir accès. Ne les affiche jamais, ne les écris jamais dans le code ni dans Git.
6. Tests sur échantillon d'abord. Chaque traitement (import, extraction, IA, synchronisation) se teste sur 10 à 20 éléments avant le volume complet. Vérifie toi-même les résultats avec des tests automatiques ; je ne regarde que ce qui relève d'un jalon.
7. Mémoire du projet. Tiens à jour deux fichiers à la racine : CLAUDE.md (les règles et décisions permanentes du projet, résumées depuis ce brief) et SUIVI.md (où on en est, ce qui est fait, ce qui reste, les décisions à confirmer). Mets-les à jour à la fin de chaque étape.
8. Git : un commit clair après chaque étape terminée, poussé sur GitHub, pour qu'on puisse toujours revenir en arrière.
9. Fin de session : termine par un résumé de trois lignes et la prochaine étape.
10. Si une de mes demandes contredit ce brief, ou augmente nettement les coûts, dis-le-moi avant d'agir.
3. Objectifs de la V1
La V1 doit faire trois choses, plus une synchronisation de fond.
1. Reprendre l'existant. Importer une fois le fichier Excel de suivi et les quelque 2 000 CV de SharePoint : dédoublonnage, normalisation des téléphones, association de chaque Word nominatif à son PDF anonymisé, et création d'une fiche structurée par consultant.
2. Matcher une mission. Je saisis ou colle un besoin client. L'outil l'enregistre comme mission ouverte, en extrait les exigences, et affiche les consultants classés par score, avec pour chacun : les raisons du score, la disponibilité, le téléphone, et le lien vers le PDF anonymisé prêt à envoyer. Je peux suivre chaque proposition (appelé, envoyé au client, retenu, refusé).
3. Traiter les candidatures reçues par email. Une boîte dédiée est reliée à l'outil. Chaque candidature est récupérée, le CV est extrait, la fiche est créée ou mise à jour (dédoublonnage), le trigramme est généré, les fichiers sont déposés dans le bon dossier SharePoint selon la convention de nommage, puis l'outil indique si le profil correspond à une mission ouverte. Sinon, il reste dans le vivier et ressortira automatiquement dans les matchings futurs.
4. Synchroniser chaque nuit. Mes équipes continuent de déposer les CV dans SharePoint sans toucher à l'outil. Chaque nuit, un traitement récupère les fichiers nouveaux ou modifiés et met à jour la base. Un rapport du matin liste ce qui a été ajouté et les cas à vérifier à la main.
Critère de réussite : quand une mission arrive, j'obtiens en moins d'une minute une liste fiable de consultants à appeler, sans ouvrir le fichier Excel ni SharePoint.
4. Architecture et outils
Privilégie des outils standards, bien documentés, que n'importe quel développeur pourra reprendre. Outils autorisés, et aucun autre : Claude Code, GitHub, Vercel, Supabase et l'API Anthropic, plus la connexion à notre Microsoft 365 existant (SharePoint et boîte de candidatures). N'ajoute aucun autre service, même gratuit, sans mon accord.
Brique
Outil
Rôle
Code
GitHub, dépôt privé
Source du code, historique, sauvegarde
Interface
Next.js (TypeScript), hébergé sur Vercel, région Paris (cdg1)
Application web utilisée par l'équipe
Base de données
Supabase, nouveau projet en région UE (Paris de préférence, sinon Francfort)
Postgres, authentification, recherche plein texte, pgvector, tâches planifiées
Fichiers
SharePoint (inchangé)
Source de vérité des CV Word et PDF
Accès Microsoft
Microsoft Graph API, via une application déclarée dans Entra ID
Lecture et écriture SharePoint, lecture de la boîte de candidatures
IA
API Anthropic (Claude)
Structuration des CV et des missions uniquement
Sources de vérité, à respecter strictement :
• L'ATS (Supabase) est la source de vérité des fiches : coordonnées, trigramme, disponibilité, statut, notes. On y crée et modifie les consultants.
• SharePoint est la source de vérité des fichiers CV. La base stocke l'identifiant SharePoint de chaque fichier, son texte extrait et son empreinte (hash), jamais une copie du fichier.
• Le fichier Excel de suivi actuel n'est lu qu'une fois, à partir d'une copie au format .xlsx que je te fournis, pour l'import initial. Il n'est plus mis à jour ensuite. Une copie lisible de la base s'obtient avec un bouton « Exporter en Excel » dans l'application, réservé aux administrateurs.
Traitements planifiés (synchronisation nocturne, relève des emails, purge RGPD) : propose-moi la solution la plus simple et sans coût supplémentaire parmi les tâches planifiées Vercel, Supabase (pg_cron et Edge Functions) ou GitHub Actions, en tenant compte des limites de durée d'exécution. Rien ne tourne sur mon ordinateur : l'import initial des 2 000 CV se lance depuis ta session en ligne, ou depuis un workflow GitHub Actions déclenché à la main si sa durée l'exige.
Fournisseur d'IA remplaçable : isole tous les appels à l'IA dans un seul module (lib/ai), avec une interface simple (extraireProfilCV, extraireExigencesMission, etc.), pour pouvoir changer de modèle ou de fournisseur sans toucher au reste.
API pour la V2 : structure le code pour qu'une API d'entrée de candidatures puisse être ajoutée plus tard (un jobboard qui déposera des candidatures). Ne la construis pas en V1, mais fais passer email et SharePoint par une même fonction d'ingestion, que l'API réutilisera.
Environnement de travail : Claude Code en ligne. Je travaille avec toi sur claude.ai/code, dans l'environnement cloud d'Anthropic, depuis le dépôt GitHub ats-unitech. Conséquences à respecter :
• Accès réseau : l'accès par défaut bloque l'internet général. Donne-moi dans le guide de préparation la liste exacte des domaines à autoriser (Supabase, Microsoft Graph et la connexion Microsoft, API Anthropic, Vercel), plutôt qu'un accès complet.
• Branches et mise en ligne : chaque travail arrive sur une branche, et Vercel crée un aperçu en ligne pour chaque branche. Quand une étape est terminée et testée, fusionne la branche dans main, qui correspond à la version de production. Si tu ne peux pas fusionner toi-même, regroupe les fusions et guide-moi pour les valider en un clic.
• Avant l'invitation de l'équipe, toute fusion dans main est sans risque. Après la mise en service, une fusion qui modifie la base de données ou les accès devient un point d'arrêt.
5. Minimisation des coûts et choix des modèles
Principe directeur : l'IA structure l'information à l'entrée, une seule fois ; le matching repose sur la base de données, sans IA. Budget cible pour l'IA : environ 25 $ pour l'import initial, puis moins de 15 $ par mois.
Modèles à utiliser
Usage
Modèle (identifiant API)
Mode d'appel
Tri des emails entrants (candidature ou non) et extraction des coordonnées
Claude Haiku 5.5 (claude-haiku-5-5)
Appel standard
Structuration d'un CV en fiche (compétences, années, secteurs, langues, résumé)
Claude Haiku 5.5 (claude-haiku-5-5) par défaut
Batch API pour l'import et la synchronisation nocturne ; appel standard pour les emails
Repli si la fiche Haiku échoue à la validation (JSON invalide, champs essentiels vides)
Claude Sonnet 5.5 (claude-sonnet-5-5)
Même mode que l'appel d'origine, une seule tentative
Extraction des exigences d'une mission
Claude Haiku 5.5 (claude-haiku-5-5)
Appel standard
« Analyse approfondie » optionnelle d'un consultant pour une mission, sur clic uniquement
Claude Sonnet 5.5 (claude-sonnet-5-5)
Appel standard
Association Word-PDF douteuse, si la comparaison de texte ne tranche pas
Aucun modèle par défaut ; Claude Haiku 5.5 seulement si je l'active
Appel standard
N'utilise jamais Opus, Fable ou Mythos dans l'application. Mets les identifiants de modèles dans un fichier de configuration unique, jamais en dur dans le code.
Validation du choix Haiku : à l'étape de test, structure les 20 mêmes CV avec Haiku 5.5 et Sonnet 5.5, montre-moi les fiches côte à côte et le coût de chaque série. Je décide alors si Haiku suffit pour la structuration. Si je choisis Sonnet, mets-le à jour dans la configuration seulement.
Règles de dépense
1. Ne jamais retraiter un fichier inchangé. Chaque fichier a une empreinte (hash SHA-256 de son contenu). Si l'empreinte et la version des consignes (prompt_version) n'ont pas changé, aucun appel à l'IA.
2. Synchronisation incrémentale. Utilise les requêtes delta de Microsoft Graph pour ne récupérer que les fichiers nouveaux ou modifiés depuis la dernière nuit.
3. Un seul appel par CV. Le Word nominatif est structuré ; le PDF anonymisé n'est jamais envoyé à l'IA, il est seulement associé.
4. Texte, pas fichier. Extrais le texte localement (bibliothèques gratuites pour .docx et .pdf) et envoie uniquement ce texte. Tronque à 30 000 caractères. Pas d'image ni de PDF envoyé tel quel à l'API.
5. CV scannés (aucun texte extractible) : n'envoie pas d'image à l'IA par défaut. Liste-les dans le rapport du matin. Propose-moi une solution d'OCR gratuite, à activer seulement si je le décide.
6. Lots pour tout ce qui n'est pas urgent. Import initial et synchronisation nocturne passent par la Batch API (50 % moins chère). Seuls les emails, les missions et l'analyse approfondie sont en appel standard.
7. Mise en cache des consignes. Les consignes et le schéma JSON forment un préfixe identique à chaque appel : active le prompt caching d'Anthropic quand le préfixe atteint la taille minimale requise.
8. Sorties courtes. Réponse en JSON strict, sans texte libre superflu, avec une limite max_tokens adaptée à chaque usage (par exemple 1 500 pour une fiche CV, 600 pour une mission).
9. Matching sans IA. Le classement des consultants pour une mission se fait par filtres, règles de score et recherche sémantique dans Postgres (section 6). Aucun appel à l'IA par consultant.
10. Vecteurs sans API payante. Pour la recherche sémantique (pgvector), utilise le modèle d'embeddings intégré à Supabase (gte-small) dans une Edge Function, ou une alternative gratuite équivalente. Pas d'API d'embeddings payante sans mon accord.
11. Développement économe. Pendant la construction, travaille sur un échantillon de 10 à 20 CV et réutilise les fiches déjà générées. Le volume complet ne passe qu'une fois, après ma validation.
12. Suivi et plafond. Enregistre chaque appel dans une table ai_usage (date, usage, modèle, tokens d'entrée et de sortie, coût estimé). Affiche le cumul du mois dans une page d'administration. Ajoute un plafond mensuel configurable (25 $ par défaut) : au-delà, les appels non urgents sont suspendus et je suis prévenu. Guide-moi aussi pour fixer un plafond de dépense dans la console Anthropic.
13. Estimation avant tout traitement de masse. Avant tout traitement dont le coût estimé dépasse 5 $, import complet compris, donne-moi l'estimation et attends mon accord. En dessous, lance-le et indique le coût réel dans ton point d'étape.
Autres coûts à garder minimaux
Vise Supabase Pro (25 $ par mois) et Vercel Pro avec un seul siège (20 $ par mois) : l'offre gratuite de Vercel est réservée à un usage non commercial, et celle de Supabase met le projet en pause après une semaine d'inactivité. Mes équipes utilisent l'application sans compte Vercel ni Supabase. Signale-moi tout choix technique qui ferait augmenter ces montants.
6. Règles métier
Trigramme
• Règle : première lettre du prénom + deux premières lettres du nom, en majuscules. Jean Dupont donne JDU.
• Normalisation : accents retirés (Éloïse Gérard donne EGE), particules et espaces ignorés selon une règle que tu me proposeras avec des exemples (Le Goff, De La Tour, prénoms composés comme Jean-Marc).
• Le trigramme n'est pas unique. Plusieurs JDU peuvent coexister. Il sert d'étiquette et de nom de fichier, jamais d'identifiant. Chaque consultant a un identifiant interne unique (UUID).
Déduplication
• Clé principale : l'email, normalisé (minuscules, espaces retirés).
• Clé de secours : le téléphone, normalisé au format international E.164 (+33…).
• Un doublon détecté met à jour la fiche existante et ajoute l'historique ; il ne crée jamais une seconde fiche. En cas de doute (même nom, email et téléphone différents), crée une alerte « doublon possible » à valider à la main.
Téléphones
Dans le fichier Excel actuel, le zéro initial a souvent disparu (612345678 au lieu de 0612345678). À l'import :
1. 9 chiffres commençant par 1 à 7 ou 9 : ajoute +33.
2. 10 chiffres commençant par 0 : remplace le 0 par +33.
3. Déjà en +33 ou 0033 : harmonise.
4. Tout autre cas (étranger, longueur anormale) : garde la valeur brute, signale-la dans le rapport d'import, ne devine pas.
Affichage dans l'interface au format 06 12 34 56 78. Dans l'export Excel, écris la colonne en texte pour que le zéro ne disparaisse plus.
Association Word nominatif et PDF anonymisé
Convention actuelle : « Unitech Solution, Prénom Nom, Fonction » pour le Word, « Unitech Solution, Trigramme, Fonction » pour le PDF. Demande-moi de vrais exemples de noms de fichiers avant d'écrire l'analyseur, les séparateurs exacts comptent.
1. Calcule le trigramme à partir du nom dans le Word, et cherche les PDF portant ce trigramme, de préférence avec la même fonction.
2. Un seul candidat : association directe.
3. Plusieurs candidats : compare le contenu des textes (entreprises, intitulés de postes, dates, compétences, formations) avec une mesure de similarité locale, sans IA. Associe si un candidat se détache nettement (seuil à calibrer avec moi sur l'échantillon).
4. Aucun candidat net : n'associe rien, ajoute le cas au rapport du matin, avec une interface pour trancher en un clic.
5. Une association validée est enregistrée par identifiants SharePoint : elle tient même si un fichier est renommé ou déplacé.
Candidatures reçues par email
• Le fichier reçu devient le Word ou le PDF nominatif. Le PDF anonymisé reste fait à la main par l'équipe en V1 : la fiche affiche « PDF anonymisé manquant » tant qu'il n'existe pas.
• Les fichiers sont renommés selon la convention et déposés dans le dossier SharePoint que je t'indiquerai.
• Un email sans pièce jointe exploitable ou qui n'est pas une candidature est classé à part, sans création de fiche.
• L'email d'origine est conservé comme référence (expéditeur, date, objet, identifiant du message), pas son contenu intégral.
Matching mission et consultants
Le score est calculé sans IA, de façon explicable : pour chaque consultant, l'interface affiche pourquoi il a ce score.
1. Filtres éliminatoires : compétences marquées obligatoires dans la mission, et éventuellement disponibilité ou localisation si je les rends obligatoires.
2. Score sur 100, pondérations configurables par un administrateur : compétences communes pondérées par leur importance, années d'expérience sur ces compétences, adéquation de séniorité, disponibilité, proximité sémantique entre le profil et la mission (pgvector).
3. Référentiel de compétences : une table de compétences avec leurs synonymes (React, ReactJS, React.js) sert à normaliser les fiches et les missions, pour que le matching fonctionne sans IA. Les nouvelles compétences rencontrées sont ajoutées automatiquement, et un administrateur peut fusionner les synonymes.
4. Suivi : chaque proposition a un statut (proposé, appelé, envoyé au client, retenu, refusé) et garde l'historique.
5. Nouvelle fiche : à chaque nouveau consultant, l'outil calcule son score face à toutes les missions ouvertes et signale les correspondances au-dessus d'un seuil réglable.
Disponibilité
La disponibilité vient du fichier Excel à l'import, puis se modifie dans l'ATS. Affiche la date de dernière mise à jour à côté, et signale les disponibilités non mises à jour depuis plus de 3 mois.
7. Modèle de données (point de départ)
Propose-moi le schéma final avec des explications simples avant de le créer. Point de départ :
Table
Contenu principal
consultants
Identifiant, prénom, nom, trigramme, email et téléphone normalisés, intitulé de poste, disponibilité et sa date de mise à jour, localisation, source, statut, notes, dates de création et de modification
documents
Consultant lié, type (Word nominatif, PDF anonymisé), identifiant et chemin SharePoint, nom de fichier, empreinte, texte extrait, date de modification SharePoint, statut d'association
profils
Fiche structurée par consultant : compétences normalisées avec niveau et années, années d'expérience totales, séniorité, secteurs, langues, certifications, résumé, vecteur sémantique, modèle et prompt_version utilisés
competences
Référentiel : nom canonique, synonymes, catégorie
missions
Client, intitulé, texte du besoin, exigences structurées (compétences obligatoires et souhaitées, années, localisation, dates), statut (ouverte, pourvue, fermée)
propositions
Mission, consultant, score et détail du score, statut de suivi, historique
emails_entrants
Identifiant du message, expéditeur, date, objet, statut de traitement, consultant créé ou mis à jour
alertes
Cas à vérifier : doublon possible, association Word-PDF douteuse, téléphone invalide, CV illisible
executions
Journal des synchronisations et imports : début, fin, éléments traités, erreurs, rapport
ai_usage
Suivi de chaque appel IA et de son coût estimé
journal_acces
Qui a consulté, modifié ou exporté quelle fiche
utilisateurs et rôles
Profils liés à l'authentification Supabase
Chaque table a des dates de création et de modification. Toute suppression de consultant est tracée.
8. Sécurité, accès et RGPD
Personne ne surveillera l'outil après sa mise en service : la sécurité doit être en place dès la V1, et tu dois m'expliquer chaque mesure.
Accès de l'équipe
1. Pas d'inscription publique. Seul un administrateur invite un utilisateur. Propose-moi la connexion avec les comptes Microsoft 365 de l'entreprise (fournisseur Azure de Supabase Auth), sinon lien magique par email.
2. Deux rôles : administrateur (gestion des utilisateurs, réglages, pondérations, purge, exports) et recruteur (consultation, création, modification, matching). Demande-moi si un rôle lecture seule est utile.
3. Retrait d'accès en un clic quand quelqu'un quitte l'entreprise.
4. Double authentification activée, avec ton aide pas à pas, sur tous les comptes d'administration : GitHub, Vercel, Supabase, console Anthropic, Microsoft 365.
Protection des données
1. Row Level Security activée sur toutes les tables, sans exception, avec des règles testées.
2. Clés secrètes côté serveur uniquement : la clé service_role de Supabase, la clé Anthropic et les secrets Microsoft ne doivent jamais apparaître dans le code du navigateur, dans Git ni dans les journaux.
3. Privilège minimal pour Microsoft : l'application Entra ID n'accède qu'au site SharePoint concerné (Sites.Selected) et qu'à la boîte de candidatures (politique d'accès limitée à cette boîte), pas à tout le tenant. Prépare-moi le texte exact à transmettre à l'administrateur Microsoft 365.
4. Dépôt GitHub privé, alertes de sécurité des dépendances activées.
5. Sauvegardes : sauvegardes quotidiennes Supabase, et le bouton « Exporter en Excel » pour une copie lisible à la demande. Rédige et teste avec moi une procédure de restauration.
6. Journal d'accès des consultations, modifications et exports de fiches.
RGPD
1. Hébergement de la base et de l'application en région UE.
2. Conservation : purge, après confirmation d'un administrateur, des candidats sans contact depuis 24 mois, conformément aux recommandations de la CNIL. Liste mensuelle des fiches concernées.
3. Droit d'accès et d'effacement : un bouton qui exporte toutes les données d'une personne, et un autre qui les supprime de la base et me liste les fichiers SharePoint à supprimer.
4. Information des candidats : rédige avec moi une mention à ajouter dans la réponse automatique de la boîte de candidatures (traitement, finalité, durée, droits).
5. IA : explique-moi les conditions d'utilisation des données par l'API Anthropic et ce que je dois mentionner. Les consignes envoyées à l'IA interdisent l'usage de toute caractéristique protégée (âge, sexe, origine, nationalité, situation familiale, santé, handicap, religion, apparence). Le score reste une aide à la décision : aucun refus automatique.
6. Prépare une fiche de registre des traitements pour cet outil, que je pourrai compléter.
Documentation d'exploitation
À la fin, rédige un GUIDE_EXPLOITATION.md en français simple : comment ajouter ou retirer un utilisateur, vérifier que la synchronisation tourne, lire le rapport du matin, suivre les coûts, restaurer une sauvegarde, renouveler un secret qui expire, et que faire en cas de panne.
9. Plan de construction
Suis cet ordre et enchaîne les étapes sans attendre mon accord, en t'arrêtant seulement dans les cas de la section 2. Chaque étape se termine par des tests, la mise à jour de SUIVI.md et un commit. Je ne valide que quatre jalons, où tu me montres le résultat et attends mon feu vert :
• Jalon A, après l'étape 5 : les associations Word-PDF sur l'échantillon ;
• Jalon B, après l'étape 6 : le choix du modèle et l'estimation du coût de l'import complet ;
• Jalon C, après l'étape 9 : le matching testé sur trois vraies missions passées ;
• Jalon D, avant l'étape 13 : la revue de sécurité et de RGPD, avant d'inviter l'équipe.
1. Préparation des comptes. Vérifie un par un les points de GUIDE_PREPARATION.md : GitHub avec dépôt privé, Vercel Pro, Supabase Pro en région UE, console Anthropic avec clé API et plafond de dépense, double authentification partout. Vérifie l'environnement cloud Claude Code : accès réseau limité aux domaines nécessaires et variables d'environnement en place.
2. Squelette en ligne. Application Next.js minimale, connexion sécurisée, déploiement automatique sur Vercel à chaque push. Objectif : je me connecte à une page d'accueil vide en ligne.
3. Base de données. Schéma, Row Level Security, rôles, référentiel de compétences initial. Montre-moi les tables dans Supabase.
4. Import du fichier Excel de suivi. Je te fournis une copie téléchargée au format .xlsx, tu proposes la correspondance des colonnes. Import d'abord dans un projet de test, rapport (doublons, téléphones corrigés, lignes rejetées), puis import réel si le rapport ne montre pas d'anomalie majeure. Le fichier d'origine n'est jamais modifié.
5. Connexion SharePoint. Préparation de la demande à l'administrateur Microsoft 365, puis lecture des dossiers, extraction du texte et association Word-PDF sur 20 consultants. Je valide les associations (jalon A).
6. Structuration par l'IA. Test comparatif Haiku 5.5 et Sonnet 5.5 sur les 20 mêmes CV (section 5), je choisis, puis estimation du coût de l'import complet.
7. Import complet. Les 2 000 CV en Batch API après mon accord, rapport final et liste des alertes.
8. Interface principale. Liste et recherche des consultants, fiche détaillée avec liens vers les fichiers SharePoint, gestion des alertes, page d'administration (utilisateurs, coûts, pondérations, bouton « Exporter en Excel »).
9. Matching des missions. Saisie d'une mission, extraction des exigences, classement explicable, suivi des propositions. On le teste ensemble sur trois vraies missions passées dont je connais les bons profils.
10. Synchronisation nocturne. Récupération delta SharePoint et rapport du matin.
11. Candidatures par email. Connexion à la boîte dédiée, tri, création des fiches, dépôt dans SharePoint, réponse automatique avec la mention RGPD, matching avec les missions ouvertes.
12. Sécurité et RGPD. Revue complète de la section 8 point par point, purge, export et effacement, tests des accès avec un compte recruteur.
13. Mise en service. GUIDE_EXPLOITATION.md, procédure de restauration testée, invitation de l'équipe, et un court guide utilisateur d'une page pour mes équipes.
10. Hors périmètre de la V1
Ne construis pas ces éléments maintenant, mais ne fais aucun choix qui les rendrait difficiles plus tard :
• API d'entrée pour qu'un jobboard dépose directement des candidatures, avec authentification par clé.
• Génération automatique du PDF anonymisé à partir du Word, dans le modèle Unitech Solution.
• OCR des CV scannés, si le volume le justifie.
• Envoi d'emails aux candidats ou aux clients depuis l'outil, au-delà de la réponse automatique.
• Statistiques : sources les plus efficaces, délais de placement, taux de réussite par client.
11. Ta première réponse
Ne code rien dans ta première réponse. Commence par enregistrer ce brief tel quel, sans le modifier, dans BRIEF.md à la racine du dépôt, et fais un commit : c'est la référence que tu reliras à chaque session. Puis fais seulement ceci :
1. Reformule le projet en cinq lignes maximum, pour que je vérifie que tu l'as compris.
2. Signale les points de ce brief qui te semblent risqués, contradictoires ou plus coûteux que prévu, avec ta recommandation pour chacun.
3. Vérifie les tarifs et identifiants actuels des modèles Claude dans la documentation officielle d'Anthropic, et dis-moi si un élément de la section 5 n'est plus à jour.
4. Crée CLAUDE.md (règles permanentes résumées depuis ce brief) et SUIVI.md (plan des 13 étapes avec leur statut).
5. Pose-moi tes trois premières questions, dont obligatoirement : la boîte de candidatures est-elle bien dans Microsoft 365, et ai-je accès à l'administration Microsoft 365 ou faut-il passer par quelqu'un ?
6. Rédige GUIDE_PREPARATION.md (contenu détaillé ci-dessous), puis attends que je te confirme l'avoir suivi. Vérifie alors chaque point, et démarre l'étape 1 en autonomie selon la section 2.
Le guide de préparation
Je veux recevoir dès le départ, en un seul document, tout ce que j'aurai à faire moi-même pendant le projet. Je le suis en une fois, et tu peux ensuite avancer sans m'interrompre. Il contient, dans l'ordre :
1. Les comptes et abonnements : GitHub (dépôt privé), Vercel Pro, Supabase Pro en région UE, console Anthropic (moyen de paiement, clé API, plafond de dépense mensuel), avec le coût de chacun.
2. La double authentification sur chacun de ces comptes et sur Microsoft 365.
3. La demande à l'administrateur Microsoft 365, rédigée et prête à envoyer : création de l'application dans Entra ID, permissions limitées au site SharePoint et à la boîte de candidatures, consentement administrateur, et la liste de ce qu'il doit me renvoyer.
4. La boîte de candidatures : comment la créer ou choisir une adresse existante.
5. Les informations à te fournir : chemins des dossiers SharePoint, dix vrais exemples de noms de fichiers Word et PDF, une copie .xlsx du fichier Excel de suivi, liste des utilisateurs avec leur rôle, dossier de dépôt des candidatures reçues par email.
6. Où saisir chaque clé secrète (environnement cloud Claude Code, Vercel, Supabase), sans jamais la coller dans la conversation, et la liste exacte des domaines à autoriser dans l'accès réseau de l'environnement cloud.
Pour chaque action : les écrans à suivre pas à pas, le temps estimé, comment vérifier que c'est réussi, et une case à cocher. Une action qui ne peut être faite que plus tard est marquée avec l'étape concernée, et regroupée en fin de guide.
Sources des tarifs
Tarifs relevés le 5 novembre 2026, à revérifier au lancement : tarifs de l'API Anthropic, tarifs Supabase, tarifs Vercel.
