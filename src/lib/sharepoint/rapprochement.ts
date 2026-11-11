import { normaliserNomPersonne } from "@/lib/metier/texte";
import { normaliserEmail } from "@/lib/metier/dedoublonnage";
import { normaliserTelephone } from "@/lib/metier/telephone";
import { separerPrenomNom } from "./noms";

/** Rapprochement d'un CV avec sa fiche : coordonnées trouvées dans le texte, nom tiré du nom de fichier. */

/** Emails et téléphones trouvés dans un texte de CV. */
export function coordonnees(texte: string): { emails: string[]; telephones: string[] } {
  const emails = [...new Set((texte.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []).map((e) => normaliserEmail(e)).filter(Boolean) as string[])];
  const telephones = [...new Set((texte.match(/(?:\+33|0033|0)\s*[1-9](?:[\s.-]*\d{2}){4}/g) ?? [])
    .map((t) => normaliserTelephone(t).e164).filter(Boolean) as string[])];
  return { emails, telephones };
}

/** Deux noms de la même personne malgré l'orthographe (« Marzougi » / « MARZOUGOUI », « Fahad Mohammed » / « Fahad MOHAMMAD »). */
export function nomsCompatibles(a: string, b: string): boolean {
  const mots = (t: string) => normaliserNomPersonne(t, "").split(/\s+/).filter((m) => m.length >= 3);
  const proches = (x: string, y: string) => x === y || (x.length >= 4 && y.length >= 4 && (x.startsWith(y.slice(0, 4)) && y.startsWith(x.slice(0, 4))) && Math.abs(x.length - y.length) <= 3);
  return mots(a).some((x) => mots(b).some((y) => proches(x, y)));
}

/** « Larbi AIT EL HADJ -Développeur NodeJS » → Larbi / AIT EL HADJ ; « Consultant ICF », « … anglais » : nettoyés ou rejetés. */
export function nettoyerIdentite(brut: string): { prenom: string; nom: string } | null {
  const coupe = brut.split(/\s+-|-\s+|\s+–|_/)[0];
  const mots = coupe.split(/\s+/).filter((m) => m && !/^(cv|consultant|consultante|anglais|english|francais|français|fr|en|vf|version|dossier|competences|compétences|\d+)$/i.test(m));
  if (mots.length < 2 || mots.some((m) => m.replace(/[^\p{L}]/gu, "").length < 2)) return null;
  const { prenom, nom } = separerPrenomNom(mots.join(" ").replace(/\d/g, "-"));
  return prenom && nom ? { prenom, nom } : null;
}
