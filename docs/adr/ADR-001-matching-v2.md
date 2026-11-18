# ADR-001 : Matching v2 — « la base cherche, l'IA départage »

**Statut :** Accepté (activé le 18/11/2026, réglage `matching_v2`)
**Date :** 18/11/2026
**Décideurs :** la responsable du projet (Unitech Solution)

## Contexte
- L'outil doit proposer, pour chaque mission, les consultants à appeler, parmi environ 5 000 fiches. Environ 1 400 ont un CV Word lisible, les autres n'ont que leur ligne de l'Excel.
- La méthode précédente (17/11/2026) cherchait les profils par le sens du texte (empreintes Voyage AI) et par les compétences exactes. L'IA notait ensuite un **résumé** de 100 profils : titre, une ligne et des mots-clés.
- Défauts constatés par l'équipe :
  - des profils d'un autre métier étaient proposés ;
  - la **spécialisation** (par exemple « assurance IARD ») était traitée comme une compétence parmi d'autres ;
  - un profil sans cette spécialisation pouvait obtenir 82, et le vrai spécialiste 78.
- Contraintes :
  - budget IA inférieur à 15 $/mois ;
  - outil maintenu sans développeur interne ;
  - note explicable, décision toujours humaine (règlement européen sur l'IA, recrutement = « haut risque ») ;
  - réponse rapide à l'écran (classements calculés en arrière-plan).

## Décision
Le matching se fait en quatre temps :
1. **Lecture du besoin.** L'IA (Haiku) lit la mission et en tire :
   - un **métier générique** ;
   - **0 à 3 critères obligatoires** (spécialisation, secteur, progiciel), chacun avec des synonymes, le mot-clé court en premier ;
   - des critères souhaités.

   Ces critères sont stockés (`missions.criteres_matching`), affichés sur la mission et corrigeables par l'équipe (`criteres_par_equipe`).
2. **Recherche stricte par la base.** Elle garde uniquement les profils dont le texte complet (CV et ligne de l'Excel, vue `textes_consultants`) contient le métier **et** chaque critère. La recherche ne tient pas compte des accents et ne prend que des mots entiers (`profils_eligibles`). Si moins de 3 profils sortent, la base garde les critères obligatoires seuls : c'est alors l'IA qui vérifie le métier.
3. **Départage par l'IA.** Haiku lit le **CV complet** des 30 premiers profils éligibles, 5 par appel, et donne une note sur 100 avec une raison qui cite la preuve. Elle indique aussi si chaque critère est **prouvé par une vraie expérience**. Si un critère n'est pas prouvé, **l'outil** plafonne la note à 45.
4. **Affichage et mesure.**
   - **Affichés :** les profils notés 60 ou plus.
   - **À part :** les profils proches, avec la mention « Absent du CV : … ».
   - **Mesure :** la qualité se lit dans Paramètres → Santé. Elle compte la part des profils appelés, envoyés ou retenus par l'équipe qui figurent dans les 10 premiers (`qualite_matching`).

## Options envisagées

### Option A : sens + mots-clés, puis note de l'IA sur des résumés (méthode du 17/11)
| Dimension | Évaluation |
|---|---|
| Complexité | Moyenne |
| Coût | ≈ 0,01 $ par mission |
| Qualité | Faible sur les missions spécialisées : la spécialisation est noyée, l'IA ne voit pas les expériences |
| Maintenance | Correcte |

**Pour :** rapide et peu coûteuse.
**Contre :** résultats jugés non fiables par l'équipe ; aucune règle forte sur ce qui décide de la mission.

### Option B : l'IA lit tous les CV pour chaque mission
| Dimension | Évaluation |
|---|---|
| Complexité | Faible |
| Coût | Élevé : plus de 1 000 CV par mission, soit plusieurs dollars par mission et par recalcul |
| Qualité | Bonne |
| Maintenance | Simple |

**Pour :** se rapproche le plus de « donner les CV à ChatGPT ».
**Contre :** coût et durée incompatibles avec le budget et les recalculs automatiques.

### Option C (retenue) : la base cherche les critères, l'IA départage sur le CV complet
| Dimension | Évaluation |
|---|---|
| Complexité | Moyenne : quelques fonctions SQL et deux consignes d'IA |
| Coût | ≈ 0,01 $ par mission (0,39 $ mesurés pour trois calculs complets de 27 à 29 missions) |
| Qualité | Profils proposés = critères présents dans le CV **et** preuve vérifiée par l'IA |
| Maintenance | Les critères sont visibles et corrigeables sans développeur |

**Pour :**
- règle explicable (« le CV doit contenir et prouver X ») ;
- plus de profils hors sujet ;
- la mission dit honnêtement quand la base n'a personne ;
- même méthode que les ATS du marché (critères obligatoires, puis classement).

**Contre :**
- dépend de la qualité des critères lus par l'IA, qui sont parfois trop stricts (par exemple « assurance corporate IARDT ») ;
- un CV qui décrit une compétence avec d'autres mots que les synonymes est écarté ;
- les ~3 700 fiches sans CV n'ont que la ligne de l'Excel.

## Analyse des compromis
- **La recherche stricte privilégie la précision :** pas de faux positifs, au prix de quelques profils manqués. C'est le choix demandé par l'équipe : « on affiche que ceux qui sont pertinents ».
- **Le risque de manquer un profil** est limité par trois garde-fous :
  - les synonymes, avec le mot-clé court en premier ;
  - le relâchement automatique du métier quand moins de 3 profils sortent ;
  - la section « profils proches » et la correction des critères en un clic.
- **La règle « critère non prouvé = 45 au plus » est appliquée par le code et non par l'IA.** Elle est donc déterministe : l'IA ne peut plus écrire « non prouvé » et donner 72.
- **Voyage AI reste utile, mais au second plan :** il sert à ordonner les profils éligibles et à trouver les profils proches.

## Conséquences
**Ce qui devient plus simple :**
- comprendre pourquoi un profil est proposé : le critère est visible et la raison cite la preuve ;
- régler une mission sans développeur : on corrige ses critères.

**Ce qui devient plus difficile :**
- les missions aux compétences rares affichent souvent « aucun profil pertinent ». C'est voulu, mais il faut le savoir.

**À revoir :**
- les critères trop stricts, au fil des missions ;
- le chiffre de qualité, dès que l'équipe marque des profils « appelé », « envoyé » ou « retenu » (aucun au 18/11) ;
- l'extraction des expériences par secteur et par date dans les fiches (étape 2 du plan ATS), qui rendrait la recherche plus fine.

## Actions
1. [x] Fonctions de base `profils_eligibles`, `motifs_par_profil` et `qualite_matching` ; colonnes de critères et `apercu_matching` (migrations 54 à 56).
2. [x] Consignes `CONSIGNES_CRITERES_MISSION` et `CONSIGNES_NOTE_CV` ; plafond de 45 appliqué par le code.
3. [x] Aperçu calculé en « mise en ligne invisible », puis activé (réglage `matching_v2`).
4. [ ] Corriger les critères trop stricts des missions sans profil pertinent.
5. [ ] Suivre le chiffre de qualité (Santé) une fois les premières décisions de l'équipe enregistrées.
6. [ ] Fusionner à l'écran l'ancien bloc « Le besoin en bref » et le nouveau bloc « Ce qui décide de cette mission ».
7. [ ] Retour arrière possible à tout moment : régler `matching_v2` sur `false`. Les missions sont alors reclassées avec la méthode du 17/11.
