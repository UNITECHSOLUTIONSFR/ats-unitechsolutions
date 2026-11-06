import { normaliserCompetence } from "@/lib/metier/texte";

export interface CompetenceReferentiel {
  id: string;
  nom_canonique: string;
  synonymes: string[]; // formes normalisées
}

/**
 * Index « forme normalisée -> compétence » pour ramener « ReactJS », « react.js », « React »
 * à la même compétence, sans IA.
 */
export function indexerReferentiel(referentiel: CompetenceReferentiel[]): Map<string, CompetenceReferentiel> {
  const index = new Map<string, CompetenceReferentiel>();
  for (const c of referentiel) {
    index.set(normaliserCompetence(c.nom_canonique), c);
    for (const s of c.synonymes) index.set(normaliserCompetence(s), c);
  }
  return index;
}

/** Retrouve une compétence du référentiel, ou null si elle est nouvelle (elle sera alors ajoutée). */
export function resoudreCompetence(nom: string, index: Map<string, CompetenceReferentiel>): CompetenceReferentiel | null {
  const n = normaliserCompetence(nom);
  return index.get(n) ?? index.get(n.replace(/[\s.\-_]/g, "")) ?? null;
}
