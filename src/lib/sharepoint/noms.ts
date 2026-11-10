import { calculerTrigramme } from "@/lib/metier/trigramme";
import { sansAccents } from "@/lib/metier/texte";

/**
 * Analyse des noms de fichiers CV.
 * Convention réelle observée dans SharePoint (novembre 2026) :
 *  Word nominatif : « UNITECH SOLUTIONS - CV Prénom Nom - Métier.docx »
 *  PDF anonymisé  : « UNITECH SOLUTIONS - CV TRI - Métier.pdf »
 * L'ancienne forme à virgules (« Unitech Solution, Prénom Nom, Fonction ») reste reconnue.
 */

export interface NomAnalyse {
  type: "word_nominatif" | "pdf_anonyme" | "autre";
  extension: string;
  prenom: string | null;
  nom: string | null;
  trigramme: string | null;
  fonction: string | null;
  /** Le nom suit-il la convention ? Sinon le fichier est signalé. */
  conforme: boolean;
}

const PREFIXE = /^\s*unitech[\s_-]*solutions?\s*[,;_–-]\s*/i;
/** Séparateurs entre identité et fonction : « - » entouré d'espaces (convention actuelle) ou virgule. */
const SEPARATEUR = /\s+[-–]\s+|\s*[-–]\s+(?=\S)|\s*,\s*/;

export function analyserNomFichier(nomFichier: string): NomAnalyse {
  const point = nomFichier.lastIndexOf(".");
  const extension = point > 0 ? nomFichier.slice(point + 1).toLowerCase() : "";
  const base = (point > 0 ? nomFichier.slice(0, point) : nomFichier).normalize("NFC");
  const type = extension === "docx" || extension === "doc" ? "word_nominatif" : extension === "pdf" ? "pdf_anonyme" : "autre";
  const vide: NomAnalyse = { type, extension, prenom: null, nom: null, trigramme: null, fonction: null, conforme: false };
  if (type === "autre") return vide;

  const aPrefixe = PREFIXE.test(base);
  const reste = base.replace(PREFIXE, "");
  const morceaux = reste.split(SEPARATEUR).filter(Boolean);
  const identite = (morceaux[0] ?? "").trim().replace(/^CV[\s_]+/i, "").replace(/_/g, " ").trim();
  const fonction = morceaux.slice(1).join(", ").trim() || null;

  const tri = sansAccents(identite).replace(/\s+/g, "");
  if (/^[A-Za-z]{2,4}\d?$/.test(tri) && identite.length <= 5 && (identite === identite.toUpperCase() || type === "pdf_anonyme")) {
    return { ...vide, trigramme: tri.toUpperCase(), fonction, conforme: aPrefixe && !!fonction };
  }
  const { prenom, nom } = separerPrenomNom(identite);
  if (!prenom || !nom) return { ...vide, fonction };
  return { ...vide, prenom, nom, trigramme: calculerTrigramme(prenom, nom), fonction, conforme: aPrefixe && !!fonction };
}

/**
 * Sépare « Prénom Nom ». Si un mot est entièrement en majuscules (convention NOM), il commence le nom ;
 * sinon le premier mot est le prénom et le reste le nom (« Jean-Marc Le Goff » → Jean-Marc / Le Goff).
 */
export function separerPrenomNom(identite: string): { prenom: string | null; nom: string | null } {
  const mots = identite.trim().split(/\s+/).filter(Boolean);
  if (mots.length < 2) return { prenom: null, nom: null };
  const estMajuscule = (m: string) => m.length > 1 && m === m.toUpperCase() && /\p{L}/u.test(m);
  const iMaj = mots.findIndex(estMajuscule);
  if (iMaj > 0 && mots.slice(iMaj).every(estMajuscule)) return { prenom: mots.slice(0, iMaj).join(" "), nom: mots.slice(iMaj).join(" ") };
  if (iMaj === 0 && !mots.every(estMajuscule)) {
    const fin = mots.findIndex((m) => !estMajuscule(m));
    return { prenom: mots.slice(fin).join(" "), nom: mots.slice(0, fin).join(" ") };
  }
  return { prenom: mots[0], nom: mots.slice(1).join(" ") };
}
