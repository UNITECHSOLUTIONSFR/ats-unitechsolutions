/**
 * Règles de lecture du tableau Trello des missions (fonctions pures, testées) :
 * colonne → statut, recruteur, client et intitulé tirés du titre, TJM retiré du texte lu par l'IA.
 */
import { sansAccents } from "@/lib/metier/texte";

/** Tableau Trello des missions (« new tab UTS 2027 »). Modifiable par la variable TRELLO_TABLEAU. */
export const TABLEAU_TRELLO = process.env.TRELLO_TABLEAU || "YI6w9P5e";

export type StatutMission = "ouverte" | "chez_client" | "pourvue" | "en_pause" | "fermee";
export interface Colonne { statut: StatutMission; recruteur: string | null; aRepartir: boolean }

const cle = (t: string) => sansAccents(t).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Recruteurs : seules ces colonnes « Sourcing … » sont lues (« Sourcing Kefi » est ignorée). */
const RECRUTEURS: Record<string, string> = { "sourcing anaelle": "Anaelle", "sourcing amadou": "Amadou", "sourcing m cisse": "M. Cissé" };

/** Statut d'une carte selon sa colonne ; null = colonne ignorée (la carte n'est pas lue). */
export function lireColonne(nom: string): Colonne | null {
  const k = cle(nom);
  if (RECRUTEURS[k]) return { statut: "ouverte", recruteur: RECRUTEURS[k], aRepartir: false };
  if (k.startsWith("sourcing")) return null; // autres colonnes de sourcing (Kefi) : ignorées
  if (k === "missions en cours" || k === "mission en cours") return { statut: "ouverte", recruteur: null, aRepartir: true };
  if (/^(positionnement|qualification|soutenance)/.test(k)) return { statut: "chez_client", recruteur: null, aRepartir: false };
  if (k === "go" || k.startsWith("mission terminee") || k.startsWith("missions terminees")) return { statut: "pourvue", recruteur: null, aRepartir: false };
  if (k.includes("hold")) return { statut: "en_pause", recruteur: null, aRepartir: false };
  if (k.includes("no go") || k.includes("nogo") || k.includes("sans positionnement")) return { statut: "fermee", recruteur: null, aRepartir: false };
  return null;
}

/** « EDF – Architecte système » → client EDF, intitulé « Architecte système ». Sans séparateur : pas de client dans le titre. */
export function lireTitre(titre: string): { client: string | null; intitule: string } {
  const m = /^\s*(.{2,60}?)\s+[-–—|:]\s+(.+)$/.exec(titre);
  if (m) return { client: m[1].trim(), intitule: m[2].trim() };
  return { client: null, intitule: titre.trim() };
}

const LIGNE_TJM = /\b(tjm|taux\s+journalier|tarif|budget|prix\s+de\s+vente|achat|marge)\b/i;

/** TJM de la carte (information interne, affichée en lecture seule) : la première ligne qui en parle. */
export function lireTJM(description: string): string | null {
  const ligne = description.split(/\r?\n/).find((l) => LIGNE_TJM.test(l) && /\d/.test(l));
  return ligne ? ligne.replace(/[*_#>`]/g, "").trim().slice(0, 120) : null;
}

/** Texte envoyé à l'IA : les lignes de TJM / tarif sont retirées (le TJM ne sert jamais au classement). */
export function sansTJM(texte: string): string {
  return texte.split(/\r?\n/).filter((l) => !(LIGNE_TJM.test(l) && /\d/.test(l))).join("\n");
}

/** Rapprochement d'une mission déjà créée dans l'outil : même intitulé, sans accents ni ponctuation. */
export function cleIntitule(t: string): string {
  return cle(t);
}
