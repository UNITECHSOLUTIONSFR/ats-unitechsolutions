/**
 * Durée des sessions (réglée dans l'outil, l'option Supabase n'étant pas incluse dans la formule) :
 * - au plus 7 jours depuis la connexion (date lue dans le jeton signé, impossible à modifier) ;
 * - au plus 3 jours sans aucune activité (un week-end passe, pas une absence plus longue).
 * Fermer l'ordinateur ou faire une pause ne déconnecte pas.
 */
export const DUREE_MAX_JOURS = 7;
export const INACTIVITE_MAX_JOURS = 3;
export const COOKIE_ACTIVITE = "ats_activite";

const JOUR = 86_400_000;

/** Date de connexion : la plus ancienne méthode d'authentification inscrite dans le jeton (« amr », en secondes). */
export function dateConnexion(amr: unknown): number | null {
  if (!Array.isArray(amr)) return null;
  const t = amr.map((m) => Number((m as { timestamp?: number }).timestamp)).filter((x) => Number.isFinite(x) && x > 0);
  return t.length ? Math.min(...t) * 1000 : null;
}

export function sessionExpiree(amr: unknown, derniereActivite: string | undefined, maintenant: number): "duree" | "inactivite" | null {
  const connexion = dateConnexion(amr);
  if (connexion && maintenant - connexion > DUREE_MAX_JOURS * JOUR) return "duree";
  const activite = Number(derniereActivite);
  if (Number.isFinite(activite) && activite > 0 && maintenant - activite > INACTIVITE_MAX_JOURS * JOUR) return "inactivite";
  return null;
}
