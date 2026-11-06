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
} as const;

export const MAX_TOKENS = {
  ficheCV: 1500,
  mission: 600,
  triEmail: 300,
  analyseApprofondie: 1500,
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
