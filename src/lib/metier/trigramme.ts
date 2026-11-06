import { sansAccents } from "./texte";

/**
 * Trigramme = 1re lettre du prénom + 2 premières lettres du nom, en majuscules.
 * Règle proposée (décision D6 de SUIVI.md, à confirmer) :
 *  - accents retirés ; espaces, tirets et apostrophes supprimés ;
 *  - particules « de, du, des, d' » ignorées en tête du nom si un autre mot suit ;
 *  - « Le / La » conservés (ils font partie du nom : Le Goff -> LE).
 * Exemples : Jean Dupont -> JDU ; Éloïse Gérard -> EGE ; Jean-Marc Dupont -> JDU ;
 *            Yann Le Goff -> YLE ; Anne De La Tour -> ALA ; Paul d'Artagnan -> PAR.
 * Le trigramme n'est jamais un identifiant : plusieurs personnes peuvent avoir le même.
 */
const PARTICULES = new Set(["DE", "DU", "DES", "D"]);

function mots(texte: string): string[] {
  return sansAccents(texte)
    .toUpperCase()
    .split(/[\s\-'’]+/)
    .map((m) => m.replace(/[^A-Z]/g, ""))
    .filter(Boolean);
}

export function calculerTrigramme(prenom: string, nom: string): string {
  const p = mots(prenom);
  let n = mots(nom);
  while (n.length > 1 && PARTICULES.has(n[0])) n = n.slice(1);
  const initiale = p[0]?.[0] ?? "";
  const debutNom = n.join("").slice(0, 2);
  return (initiale + debutNom).toUpperCase();
}
