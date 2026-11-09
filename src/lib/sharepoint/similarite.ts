import { sansAccents } from "@/lib/metier/texte";

/**
 * Similarité de texte locale, sans IA : cosinus entre vecteurs TF-IDF de mots.
 * Utile pour comparer un Word nominatif et des PDF anonymisés : mêmes entreprises, postes,
 * dates, compétences, formations — seul le nom de la personne disparaît.
 */

const MOTS_VIDES = new Set(
  "les des une est pour par avec dans sur aux the and for with from que qui son ses ces leur nous vous mais plus tout tous".split(" "),
);

export function motsSignificatifs(texte: string): string[] {
  return sansAccents(texte)
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((m) => (m.length >= 3 || /^\d{2,4}$/.test(m)) && !MOTS_VIDES.has(m));
}

export type Vecteur = Map<string, number>;

/** Prépare un corpus : pondération IDF calculée sur l'ensemble des documents comparés. */
export function construireVecteurs(textes: Map<string, string>): Map<string, Vecteur> {
  const tf = new Map<string, Map<string, number>>();
  const df = new Map<string, number>();
  for (const [id, t] of textes) {
    const compte = new Map<string, number>();
    for (const m of motsSignificatifs(t)) compte.set(m, (compte.get(m) ?? 0) + 1);
    tf.set(id, compte);
    for (const m of compte.keys()) df.set(m, (df.get(m) ?? 0) + 1);
  }
  const n = textes.size;
  const vecteurs = new Map<string, Vecteur>();
  for (const [id, compte] of tf) {
    const v: Vecteur = new Map();
    let norme = 0;
    for (const [m, c] of compte) {
      const poids = (1 + Math.log(c)) * Math.log(1 + n / (df.get(m) ?? 1));
      v.set(m, poids);
      norme += poids * poids;
    }
    norme = Math.sqrt(norme) || 1;
    for (const [m, p] of v) v.set(m, p / norme);
    vecteurs.set(id, v);
  }
  return vecteurs;
}

/** Cosinus entre deux vecteurs normés : 0 = rien en commun, 1 = identiques. */
export function cosinus(a: Vecteur | undefined, b: Vecteur | undefined): number {
  if (!a || !b || a.size === 0 || b.size === 0) return 0;
  const [petit, grand] = a.size < b.size ? [a, b] : [b, a];
  let s = 0;
  for (const [m, p] of petit) s += p * (grand.get(m) ?? 0);
  return Math.round(s * 1000) / 1000;
}
