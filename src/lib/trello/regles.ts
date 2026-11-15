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

const MOTS_VIDES = new Set(["les", "des", "une", "pour", "avec", "sur", "dans", "the", "and", "h/f", "f/h", "mission", "missions", "poste", "profil"]);

/** Mots significatifs d'un intitulé (sans accents, 3 lettres ou plus, ou « .net », « c# »…). */
export function motsIntitule(t: string): Set<string> {
  return new Set(sansAccents(t).toLowerCase().split(/[\s/,()–—:|+-]+/).map((m) => m.replace(/^[^a-z0-9#.]+|[^a-z0-9#+]+$/g, ""))
    .filter((m) => (m.length >= 3 || /[#.+]/.test(m)) && !MOTS_VIDES.has(m)));
}

/**
 * Rapprochement souple des missions déjà créées dans l'outil avec les cartes Trello :
 * même client (retrouvé dans le titre ou le début de la description) et mots du poste en commun.
 * Chaque mission et chaque carte n'est reliée qu'une fois (meilleure paire d'abord). Renvoie carte → mission.
 */
export function rapprocher(
  missions: { id: string; intitule: string; client: string | null }[],
  cartes: { id: string; name: string; desc: string }[],
): Map<string, string> {
  const paires: { carte: string; mission: string; score: number }[] = [];
  for (const c of cartes) {
    const motsCarte = motsIntitule(c.name);
    const texte = cle(`${c.name} ${c.desc.slice(0, 400)}`);
    for (const m of missions) {
      const motsMission = motsIntitule(m.intitule);
      if (!motsMission.size || !motsCarte.size) continue;
      const communs = [...motsMission].filter((x) => motsCarte.has(x)).length;
      const recouvrement = communs / Math.min(motsMission.size, motsCarte.size);
      const premierMotClient = m.client ? cle(m.client).split(" ").find((x) => x.length >= 3) : undefined;
      const memeClient = !!premierMotClient && texte.split(" ").includes(premierMotClient);
      if ((memeClient && communs >= 2 && recouvrement >= 0.4) || recouvrement >= 0.8) paires.push({ carte: c.id, mission: m.id, score: recouvrement + (memeClient ? 1 : 0) });
    }
  }
  const lien = new Map<string, string>();
  const missionsPrises = new Set<string>();
  for (const p of paires.sort((a, b) => b.score - a.score)) {
    if (lien.has(p.carte) || missionsPrises.has(p.mission)) continue;
    lien.set(p.carte, p.mission);
    missionsPrises.add(p.mission);
  }
  return lien;
}
