import { normaliserNomPersonne } from "./texte";

/** Email normalisé : minuscules, espaces retirés. Vide ou sans « @ » -> null. */
export function normaliserEmail(valeur: unknown): string | null {
  if (valeur === null || valeur === undefined) return null;
  const s = String(valeur).toLowerCase().replace(/\s+/g, "").replace(/^mailto:/, "");
  return /^[^@]+@[^@]+\.[^@]+$/.test(s) ? s : null;
}

export interface FicheComparable {
  id?: string;
  prenom: string;
  nom: string;
  email: string | null;
  telephone_e164: string | null;
}

export type ResultatDoublon =
  | { type: "email"; id: string }
  | { type: "telephone"; id: string }
  | { type: "possible"; ids: string[] }
  | { type: "aucun" };

/**
 * Règles du brief :
 *  - clé principale : l'email normalisé ;
 *  - clé de secours : le téléphone E.164 ;
 *  - même nom mais email et téléphone différents : « doublon possible », à valider à la main.
 */
export function chercherDoublon(nouvelle: FicheComparable, existantes: FicheComparable[]): ResultatDoublon {
  if (nouvelle.email) {
    const f = existantes.find((e) => e.email && e.email === nouvelle.email);
    if (f?.id) return { type: "email", id: f.id };
  }
  if (nouvelle.telephone_e164) {
    const f = existantes.find((e) => e.telephone_e164 && e.telephone_e164 === nouvelle.telephone_e164);
    if (f?.id) return { type: "telephone", id: f.id };
  }
  const nom = normaliserNomPersonne(nouvelle.prenom, nouvelle.nom);
  const ids = existantes
    .filter((e) => e.id && normaliserNomPersonne(e.prenom, e.nom) === nom)
    .map((e) => e.id as string);
  return ids.length ? { type: "possible", ids } : { type: "aucun" };
}
