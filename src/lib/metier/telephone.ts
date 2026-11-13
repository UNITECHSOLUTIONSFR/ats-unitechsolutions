/**
 * Normalisation des téléphones (règles du brief, section 6).
 *  1. 9 chiffres commençant par 1 à 7 ou 9 : on ajoute +33 (zéro perdu par Excel).
 *  2. 10 chiffres commençant par 0 : le 0 devient +33.
 *  3. Déjà en +33 ou 0033 (ou « 33 » suivi de 9 chiffres, le « + » perdu) : on harmonise.
 *     Une lettre « O » tapée à la place du zéro est corrigée (décision du 10/11/2026, à confirmer).
 *  4. Tout autre cas : on garde la valeur brute et on la signale. On ne devine pas.
 */

export type StatutTelephone = "vide" | "valide" | "corrige" | "invalide";

export interface ResultatTelephone {
  e164: string | null; // format international, ex. +33612345678
  brut: string; // valeur d'origine
  statut: StatutTelephone;
}

const NEUF_CHIFFRES_FR = /^[1-9]\d{8}$/;

export function normaliserTelephone(valeur: unknown): ResultatTelephone {
  // Caractères invisibles collés depuis Outlook ou un téléphone (marques de direction, espaces insécables).
  const brut = valeur === null || valeur === undefined ? "" : String(valeur).replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, "").replace(/\u00A0/g, " ").trim();
  // Valeurs de remplissage (« X », « / », « Non disponible », « LinkedIn »…) : pas de numéro, rien à signaler.
  if (brut === "" || /^[\s/_x.-]*$/i.test(brut) || /^(non disponible|n\/?a|contact linkedin|linkedin|aucun)$/i.test(brut)) return { e164: null, brut, statut: "vide" };
  // Deux numéros « 06… / 07… » : on garde le premier (la valeur brute reste conservée).
  if (/\d.*\s\/\s*[+\d]/.test(brut)) {
    const premier = normaliserTelephone(brut.split("/")[0]);
    if (premier.e164) return { ...premier, brut, statut: "corrige" };
  }

  // Excel peut renvoyer un nombre : « 612345678 » ou « 612345678.0 »
  let s = brut.replace(/\.0+$/, "");
  // On retire espaces, points, tirets, barres, et le « (0) » de « +33 (0)6… »
  s = s.replace(/\(0\)/g, "").replace(/[\s.\-/()]/g, "");
  // « O7 58… » : la lettre O tapée au lieu du zéro.
  if (/^[+\dOo]+$/.test(s) && /[Oo]/.test(s)) s = s.replace(/[Oo]/g, "0");

  const fr = (neuf: string, statut: StatutTelephone): ResultatTelephone =>
    NEUF_CHIFFRES_FR.test(neuf) ? { e164: `+33${neuf}`, brut, statut } : { e164: null, brut, statut: "invalide" };

  if (s.startsWith("+33")) {
    const reste = s.slice(3);
    if (reste.length === 10 && reste.startsWith("0")) return fr(reste.slice(1), "corrige"); // +33 06…
    return fr(reste, "valide");
  }
  if (s.startsWith("0033")) return fr(s.slice(4), "valide");
  if (!/^\d+$/.test(s)) return { e164: null, brut, statut: "invalide" };
  if (s.length === 10 && s.startsWith("0")) return fr(s.slice(1), "valide");
  if (s.length === 9 && /^[1-79]/.test(s)) return fr(s, "corrige");
  if (s.length === 11 && s.startsWith("33") && /^[1-9]/.test(s.slice(2))) return fr(s.slice(2), "corrige"); // 33612345678 (« + » perdu)
  return { e164: null, brut, statut: "invalide" };
}

/** Affichage : +33612345678 -> « 06 12 34 56 78 ». Les autres formats sont rendus tels quels. */
export function formaterTelephone(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = /^\+33(\d{9})$/.exec(e164);
  if (!m) return e164;
  return `0${m[1]}`.replace(/(\d{2})(?=\d)/g, "$1 ");
}

/**
 * Lien WhatsApp vers un numéro (application sur téléphone, WhatsApp Web sur ordinateur), message de départ pré-rempli.
 * Aucune connexion à configurer : c'est le WhatsApp de la personne qui clique qui s'ouvre.
 */
export function lienWhatsApp(telephone: string | null | undefined, prenom?: string | null): string | null {
  if (!telephone) return null;
  const e164 = telephone.startsWith("+") ? telephone.replace(/[^\d+]/g, "") : normaliserTelephone(telephone).e164;
  if (!e164 || !/^\+\d{8,15}$/.test(e164)) return null;
  const bonjour = prenom && prenom !== "—" ? `Bonjour ${prenom}, ` : "Bonjour, ";
  return `https://wa.me/${e164.slice(1)}?text=${encodeURIComponent(`${bonjour}je suis du recrutement d'Unitech Solutions.`)}`;
}
