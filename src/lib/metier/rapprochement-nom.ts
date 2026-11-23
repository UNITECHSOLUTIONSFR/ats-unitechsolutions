import { normaliserNomPersonne } from "./texte";

/**
 * Rapprochement souple d'un nom de fichier CV avec les fiches (23/11/2026) : même prénom, et les mots du nom de l'un sont
 * tous dans le nom de l'autre (« OUMAJOUD » ↔ « AIT OUMAJOUD », « DE LA FONTAINE » ↔ « FONTAINE »).
 * Renvoie les identifiants des fiches qui conviennent (à n'utiliser que s'il n'y en a qu'une).
 */
export function fichesNomSouple(prenom: string, nom: string, fiches: { id: string; prenom: string; nom: string }[]): string[] {
  const mots = (t: string) => normaliserNomPersonne("", t).split(" ").filter((m) => m.length >= 2);
  const p = mots(prenom), n = mots(nom);
  if (!p.length || !n.length) return [];
  const inclus = (a: string[], b: string[]) => a.every((m) => b.includes(m));
  return fiches.filter((f) => {
    const fp = mots(f.prenom), fn = mots(f.nom);
    if (!fp.length || !fn.length || fp[0] !== p[0]) return false;
    return inclus(n, fn) || inclus(fn, n);
  }).map((f) => f.id);
}
