/**
 * Fichier de configuration UNIQUE des modèles d'IA.
 * Pour changer de modèle, on modifie seulement ce fichier.
 * Interdits dans l'application : Opus, Fable, Mythos.
 */
export const MODELES = {
  triEmail: "claude-haiku-5-5",
  ficheCV: "claude-haiku-5-5",
  ficheCVRepli: "claude-sonnet-5-5", // une seule tentative si la fiche Haiku est invalide
  mission: "claude-haiku-5-5",
  analyseApprofondie: "claude-sonnet-5-5",
  reponseDisponibilite: "claude-haiku-5-5", // lecture d'une réponse à la relance des disponibilités
  lectureScan: "claude-haiku-5-5", // CV scannés : recopie du texte d'un PDF image
  cvUnitech: "claude-haiku-5-5", // réécriture d'un CV dans le modèle Unitech
  adequation: "claude-haiku-5-5", // section « Adéquation à la mission »
  recherche: "claude-haiku-5-5", // section « Recherche » : phrase du recruteur → critères
  avisMission: "claude-haiku-5-5", // « Avis IA » sur un consultant pour une mission (sur demande)
  triCandidats: "claude-haiku-5-5", // ancien matching (remplacé le 17/11/2026 par noteCandidats)
  noteCandidats: "claude-haiku-5-5", // matching : note sur 100 et raison pour les 60 profils présélectionnés d'une mission
  criteresMission: "claude-haiku-5-5", // matching v2 : métier et critères obligatoires d'une mission (avec synonymes)
  noteCV: "claude-haiku-5-5", // matching v2 : note sur 100 en lisant le CV complet des profils qui remplissent les critères
} as const;

/**
 * Empreintes de sens (matching) : service Voyage AI, modèle multilingue (choisi le 17/11/2026 : meilleur service prêt à
 * l'emploi pour le français). Clé VOYAGE_API_KEY (Vercel). 200 millions de jetons gratuits, puis 0,12 $ par million.
 */
export const EMPREINTES = { modele: "voyage-4-large", dimension: 1024, tarifParMillion: 0.12 } as const;

export const MAX_TOKENS = {
  ficheCV: 4000, // CV longs : 1 500 coupait la réponse (fiche invalide → « lecture impossible »), constat du 19/11/2026
  mission: 1500, // fiches longues (beaucoup de technologies) : 600 coupait la réponse
  triEmail: 300,
  analyseApprofondie: 1500,
  reponseDisponibilite: 250,
  lectureScan: 8000,
  cvUnitech: 16000, // CV longs : toutes les tâches de chaque mission sont reprises, rien n'est coupé
  adequation: 1200,
  recherche: 700,
  avisMission: 700,
  triCandidats: 3500, // 30 avis courts
  noteCandidats: 3500, // 30 notes et raisons courtes par appel (deux appels par mission)
  criteresMission: 900,
  noteCV: 5000, // 4 CV complets par appel : note, raison, récapitulatif et analyse point par point pour chacun
} as const;

/** Texte envoyé à l'IA tronqué à cette longueur (règle 4 du brief). */
export const LONGUEUR_MAX_TEXTE = 30_000;

/**
 * Tarifs en $ par million de tokens (documentation Anthropic, relevés le 6 novembre 2026).
 * Haiku 5.5 : prix pour une demande de 100 000 tokens au plus (un CV est bien en dessous).
 * Le mode « batch » coûte 50 % de moins.
 */
export const TARIFS: Record<string, { entree: number; sortie: number; cacheLecture: number; cacheEcriture: number }> = {
  "claude-haiku-5-5": { entree: 0.1, sortie: 0.5, cacheLecture: 0.01, cacheEcriture: 0.125 },
  "claude-sonnet-5-5": { entree: 2, sortie: 10, cacheLecture: 0.1, cacheEcriture: 2.5 },
};

export interface ConsommationTokens {
  entree: number;
  sortie: number;
  cacheLecture?: number;
  cacheEcriture?: number;
}

export function estimerCoutUSD(modele: string, t: ConsommationTokens, mode: "standard" | "batch" = "standard"): number {
  const tarif = TARIFS[modele];
  if (!tarif) throw new Error(`Modèle sans tarif connu : ${modele}`);
  const cout =
    (t.entree * tarif.entree +
      t.sortie * tarif.sortie +
      (t.cacheLecture ?? 0) * tarif.cacheLecture +
      (t.cacheEcriture ?? 0) * tarif.cacheEcriture) /
    1_000_000;
  return mode === "batch" ? cout / 2 : cout;
}
