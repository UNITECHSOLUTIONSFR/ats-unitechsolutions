import { sansAccents } from "@/lib/metier/texte";
import { construireVecteurs, cosinus } from "./similarite";

/**
 * Association Word nominatif ↔ PDF anonymisé (brief, section 6) :
 *  1. trigramme calculé depuis le nom du Word → PDF portant ce trigramme (de préférence même fonction) ;
 *  2. un seul candidat → association directe ;
 *  3. plusieurs → similarité de texte locale ; associe si un candidat se détache nettement ;
 *  4. aucun candidat net → rien n'est associé, le cas part en « douteux » (arbitrage en un clic).
 * Un même PDF ne peut être associé qu'à un seul Word.
 */

export interface DocAssociable {
  id: string;
  nomFichier: string;
  trigramme: string | null;
  fonction: string | null;
  metier: string | null;
  texte: string | null;
}

export type Methode =
  | "trigramme_unique"
  | "trigramme_fonction"
  | "similarite_texte"
  | "aucun_candidat"
  | "ambigu"
  | "conflit_pdf";

export interface ResultatAssociation {
  wordId: string;
  pdfId: string | null;
  /** PDF proposé quand rien n'est associé automatiquement (à confirmer en un clic). */
  suggestionPdfId: string | null;
  statut: "associe_auto" | "douteux" | "sans_correspondance";
  methode: Methode;
  similarite: number | null;
  candidats: { pdfId: string; similarite: number }[];
  raison: string;
}

export interface Seuils {
  /** Similarité minimale du meilleur candidat (plusieurs candidats). */
  similariteMin: number;
  /** Écart minimal avec le 2e candidat pour trancher. */
  ecartMin: number;
  /** Candidat unique mais textes trop différents → douteux (garde-fou). */
  alerteCandidatUnique: number;
  /** Aucun trigramme correspondant : suggestion par le texte au-delà de ce seuil. */
  suggestionSansTrigramme: number;
}

export const SEUILS_DEFAUT: Seuils = {
  similariteMin: 0.5,
  ecartMin: 0.15,
  alerteCandidatUnique: 0.3,
  suggestionSansTrigramme: 0.6,
};

/** Fonction normalisée pour comparaison : minuscules, sans accents, mots triés. */
export function normaliserFonction(f: string | null): string {
  return sansAccents(f ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .sort()
    .join(" ");
}

function memeFonction(a: string | null, b: string | null): boolean {
  const x = normaliserFonction(a);
  return x !== "" && x === normaliserFonction(b);
}

const aDuTexte = (d: DocAssociable) => (d.texte ?? "").replace(/\s/g, "").length >= 200;

export function associer(words: DocAssociable[], pdfs: DocAssociable[], seuils: Seuils = SEUILS_DEFAUT): ResultatAssociation[] {
  const textes = new Map<string, string>();
  for (const d of [...words, ...pdfs]) if (aDuTexte(d)) textes.set(d.id, d.texte!);
  const vecteurs = construireVecteurs(textes);
  const sim = (a: DocAssociable, b: DocAssociable) => (textes.has(a.id) && textes.has(b.id) ? cosinus(vecteurs.get(a.id), vecteurs.get(b.id)) : null);

  const parTrigramme = new Map<string, DocAssociable[]>();
  for (const p of pdfs) if (p.trigramme) parTrigramme.set(p.trigramme, [...(parTrigramme.get(p.trigramme) ?? []), p]);

  const resultats: ResultatAssociation[] = words.map((w) => {
    const base = { wordId: w.id, suggestionPdfId: null as string | null };
    const tous = w.trigramme ? (parTrigramme.get(w.trigramme) ?? []) : [];
    const candidats = tous.map((p) => ({ p, s: sim(w, p) })).sort((a, b) => (b.s ?? -1) - (a.s ?? -1));
    const liste = candidats.map((c) => ({ pdfId: c.p.id, similarite: c.s ?? 0 }));

    if (candidats.length === 0) {
      // Aucun PDF à ce trigramme : on cherche une suggestion par le texte (jamais associée d'office).
      let meilleur: { p: DocAssociable; s: number } | null = null;
      for (const p of pdfs) {
        const s = sim(w, p);
        if (s !== null && (!meilleur || s > meilleur.s)) meilleur = { p, s };
      }
      if (meilleur && meilleur.s >= seuils.suggestionSansTrigramme)
        return { ...base, pdfId: null, suggestionPdfId: meilleur.p.id, statut: "douteux", methode: "aucun_candidat",
          similarite: meilleur.s, candidats: [{ pdfId: meilleur.p.id, similarite: meilleur.s }],
          raison: `Aucun PDF au trigramme ${w.trigramme ?? "?"} ; texte très proche de « ${meilleur.p.nomFichier} »` };
      return { ...base, pdfId: null, statut: "sans_correspondance", methode: "aucun_candidat", similarite: null, candidats: [],
        raison: `Aucun PDF au trigramme ${w.trigramme ?? "?"} (PDF anonymisé manquant ?)` };
    }

    if (candidats.length === 1) {
      const { p, s } = candidats[0];
      if (s !== null && s < seuils.alerteCandidatUnique)
        return { ...base, pdfId: null, suggestionPdfId: p.id, statut: "douteux", methode: "trigramme_unique", similarite: s, candidats: liste,
          raison: `Seul PDF au trigramme ${w.trigramme}, mais contenus très différents (similarité ${s})` };
      return { ...base, pdfId: p.id, statut: "associe_auto", methode: "trigramme_unique", similarite: s, candidats: liste,
        raison: `Seul PDF au trigramme ${w.trigramme}` };
    }

    // Plusieurs candidats : comparaison des textes.
    const [c1, c2] = candidats;
    if (c1.s !== null && c1.s >= seuils.similariteMin && c1.s - (c2.s ?? 0) >= seuils.ecartMin)
      return { ...base, pdfId: c1.p.id, statut: "associe_auto", methode: "similarite_texte", similarite: c1.s, candidats: liste,
        raison: `${candidats.length} PDF au trigramme ${w.trigramme} ; texte nettement le plus proche (${c1.s} contre ${c2.s ?? 0})` };
    // Textes indisponibles ou trop proches : la fonction peut trancher si un seul candidat la partage.
    const memes = candidats.filter((c) => memeFonction(w.fonction, c.p.fonction));
    if (memes.length === 1 && (memes[0].s === null || memes[0].s >= seuils.alerteCandidatUnique))
      return { ...base, pdfId: memes[0].p.id, statut: "associe_auto", methode: "trigramme_fonction", similarite: memes[0].s, candidats: liste,
        raison: `${candidats.length} PDF au trigramme ${w.trigramme} ; un seul avec la même fonction` };
    return { ...base, pdfId: null, suggestionPdfId: c1.p.id, statut: "douteux", methode: "ambigu", similarite: c1.s, candidats: liste,
      raison: `${candidats.length} PDF au trigramme ${w.trigramme}, aucun ne se détache nettement` };
  });

  // Un PDF ne peut appartenir qu'à un seul Word : en cas de conflit, le plus proche garde le PDF
  // s'il se détache nettement, sinon tous passent en douteux.
  const parPdf = new Map<string, ResultatAssociation[]>();
  for (const r of resultats) if (r.pdfId) parPdf.set(r.pdfId, [...(parPdf.get(r.pdfId) ?? []), r]);
  for (const [pdfId, rs] of parPdf) {
    if (rs.length < 2) continue;
    rs.sort((a, b) => (b.similarite ?? -1) - (a.similarite ?? -1));
    const net = rs[0].similarite !== null && rs[0].similarite - (rs[1].similarite ?? 0) >= seuils.ecartMin;
    rs.forEach((r, i) => {
      if (net && i === 0) return;
      Object.assign(r, { pdfId: null, suggestionPdfId: pdfId, statut: "douteux", methode: "conflit_pdf",
        raison: `Le même PDF correspond à ${rs.length} Word différents` });
    });
  }
  return resultats;
}
