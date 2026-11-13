/**
 * Tableau de suivi (copie fidèle de l'Excel) : règles pures, sans base ni navigateur,
 * partagées entre le serveur (import, modifications) et l'écran (filtres, tri).
 */
import type { ChampFiche } from "@/lib/import/excel";
import { normaliserEmail } from "@/lib/metier/dedoublonnage";
import { normaliserTelephone, formaterTelephone } from "@/lib/metier/telephone";
import { sansAccents } from "@/lib/metier/texte";

export type StatutFiche = "candidat" | "consultant" | "en_mission" | "inactif";

export function statutDepuisTexte(t: string | null): StatutFiche {
  const s = (t ?? "").toLowerCase();
  if (/inactif|parti|archiv/.test(s)) return "inactif";
  // L'Excel ne contient que des candidats : « CDI », « Freelance » (contrat) ou « En mission » (disponibilité) restent des candidats.
  return "candidat";
}

/** Sérialisation stable d'un objet (ordre des clés indifférent), pour comparer des lignes. */
export function cleStable(ligne: number, valeurs: Record<string, string>): string {
  // « Domaine » est calculé par l'outil (fusion des onglets métier) : il ne doit pas changer l'identité d'une ligne.
  const tri = Object.keys(valeurs).filter((k) => k !== "Domaine").sort().map((k) => [k, valeurs[k]]);
  return `${ligne}|${JSON.stringify(tri)}`;
}

/** Même contenu sans le numéro de ligne : retrouve une ligne déplacée dans l'Excel (lignes insérées ou supprimées au-dessus). */
export function cleContenu(valeurs: Record<string, string>): string {
  return cleStable(0, valeurs).slice(2);
}

const DATE_FR = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/**
 * Modification d'une cellule de l'onglet principal → modification de la fiche consultant liée.
 * Renvoie null si la colonne n'alimente aucun champ de la fiche.
 */
export function majFicheDepuisCellule(champ: ChampFiche, valeur: string): Record<string, unknown> | null {
  const v = valeur.trim();
  const ouNull = v === "" ? null : v;
  switch (champ) {
    case "prenom":
      return { prenom: v || "—" };
    case "nom":
      return v ? { nom: v } : null; // le nom ne peut pas être vidé
    case "email":
      return { email: normaliserEmail(v) };
    case "telephone": {
      const t = normaliserTelephone(v);
      return { telephone_e164: t.e164, telephone_brut: t.statut === "invalide" ? t.brut : null };
    }
    case "trigramme":
      return v ? { trigramme: v.toUpperCase() } : null;
    case "disponibilite": {
      const d = DATE_FR.exec(v);
      return {
        disponibilite: d ? null : ouNull,
        disponible_le: d ? `${d[3]}-${d[2]}-${d[1]}` : null,
        disponibilite_maj_le: new Date().toISOString(),
      };
    }
    case "statut":
      return { statut: statutDepuisTexte(v) };
    case "email_2":
      return { email_2: normaliserEmail(v) ?? ouNull };
    case "intitule_poste":
    case "localisation":
    case "commentaire_email":
    case "notes":
    case "experience":
    case "tjm_salaire":
    case "linkedin":
    case "cv_lien":
      return { [champ]: ouNull };
    default:
      return null; // nom complet, date de mise à jour : pas de champ direct
  }
}

/** Valeur montrée à l'écran : téléphones remis au format 06 12 34 56 78 (le zéro perdu par Excel est rétabli). */
export function valeurEcran(champ: ChampFiche | undefined, valeur: string | undefined): string {
  if (!valeur) return "";
  if (champ === "telephone") {
    const t = normaliserTelephone(valeur);
    if (t.e164) return formaterTelephone(t.e164);
  }
  return valeur;
}

// ---------------------------------------------------------------------------
// Filtres et tri (comme les filtres automatiques d'Excel)
// ---------------------------------------------------------------------------

export const VIDE = "(Vides)";

export interface LigneTableau {
  id: string;
  position: number;
  consultant_id: string | null;
  valeurs: Record<string, string>;
  /** Texte cherchable en plus des colonnes (compétences du CV analysé). */
  recherche?: string;
  /** Repères de la fiche reliée, pour les filtres rapides. */
  meta?: { dispoMaj?: string | null; dispoLe?: string | null; dispo?: string | null; creeLe?: string; source?: string; cvAnalyse?: boolean };
}

export type FiltreRapide = "disponibles" | "a_verifier" | "semaine" | "cv" | "email_jour" | "sharepoint_jour";

/** Date du jour à Paris (AAAA-MM-JJ). */
const jourParis = (t: number | string) => new Date(t).toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });

/** Filtres rapides de l'écran Consultants (au-dessus du tableau). */
export function filtreRapide(l: LigneTableau, f: FiltreRapide, maintenant: number): boolean {
  const m = l.meta;
  if (!m) return false;
  if (f === "cv") return !!m.cvAnalyse;
  // Fiches créées aujourd'hui depuis une candidature email, ou depuis un CV déposé dans SharePoint.
  if (f === "email_jour" || f === "sharepoint_jour") return m.source === (f === "email_jour" ? "email" : "sharepoint") && !!m.creeLe && jourParis(m.creeLe) === jourParis(maintenant);
  if (f === "semaine") return !!m.creeLe && Date.parse(m.creeLe) > maintenant - 7 * 86_400_000;
  if (f === "a_verifier") return !m.dispoMaj || Date.parse(m.dispoMaj) < maintenant - 90 * 86_400_000;
  const aujourdhui = new Date(maintenant).toISOString().slice(0, 10);
  return /imm[ée]diat|asap|^disponible$/i.test((m.dispo ?? "").trim()) || (!!m.dispoLe && m.dispoLe <= aujourdhui);
}

/** Filtres par colonne : liste des valeurs cochées (absente = pas de filtre). */
export type Filtres = Record<string, string[]>;
export interface Tri {
  colonne: string;
  sens: "asc" | "desc";
}

const pli = (s: string) => sansAccents(s).toLowerCase();

// Texte de recherche calculé une seule fois par ligne (une ligne modifiée est un nouvel objet, donc réindexée).
const INDEX = new WeakMap<LigneTableau, { tout: string; chiffres: string }>();
function indexRecherche(l: LigneTableau, affiche: (c: string, v: string | undefined) => string) {
  let i = INDEX.get(l);
  if (!i) {
    const tout = pli([...Object.entries(l.valeurs).map(([c, v]) => `${v} ${affiche(c, v)}`), l.recherche ?? ""].join(" "));
    i = { tout, chiffres: tout.replace(/\D/g, "") };
    INDEX.set(l, i);
  }
  return i;
}

export function filtrerEtTrier(
  lignes: LigneTableau[],
  filtres: Filtres,
  recherche: string,
  tri: Tri | null,
  affiche: (colonne: string, valeur: string | undefined) => string = (_c, v) => v ?? "",
  /** Lignes retenues par la recherche même si les mots ne sont pas dans les colonnes (ex. trouvés dans le texte du CV). */
  trouveesAilleurs?: Set<string>,
): LigneTableau[] {
  const mots = pli(recherche).split(/\s+/).filter(Boolean);
  const actifs = Object.entries(filtres).map(([c, vals]) => [c, new Set(vals)] as const);
  const res = lignes.filter((l) => {
    for (const [c, vals] of actifs) {
      const v = affiche(c, l.valeurs[c]);
      if (!vals.has(v === "" ? VIDE : v)) return false;
    }
    if (!mots.length) return true;
    if (trouveesAilleurs && l.consultant_id && trouveesAilleurs.has(l.consultant_id)) return true;
    // Recherche sur toutes les colonnes, sans accents ni majuscules ; un numéro se retrouve quel que soit son format.
    const { tout, chiffres } = indexRecherche(l, affiche);
    return mots.every((m) => tout.includes(m) || (/^\+?\d[\d\s.]{3,}$/.test(m) && chiffres.includes(m.replace(/\D/g, "").replace(/^0/, ""))));
  });
  if (tri) {
    const f = tri.sens === "asc" ? 1 : -1;
    res.sort((a, b) => f * comparer(a.valeurs[tri.colonne], b.valeurs[tri.colonne]) || a.position - b.position);
  }
  return res;
}

/** Comparaison « naturelle » : dates JJ/MM/AAAA, nombres, puis texte ; les vides toujours en dernier. */
export function comparer(a: string | undefined, b: string | undefined): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const da = DATE_FR.exec(a), db = DATE_FR.exec(b);
  if (da && db) return `${da[3]}${da[2]}${da[1]}`.localeCompare(`${db[3]}${db[2]}${db[1]}`);
  const na = Number(a.replace(",", ".")), nb = Number(b.replace(",", "."));
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return a.localeCompare(b, "fr", { sensitivity: "base", numeric: true });
}

/** Valeurs distinctes d'une colonne (pour la liste à cocher du filtre), triées. */
export function valeursDistinctes(lignes: LigneTableau[], colonne: string, affiche: (c: string, v: string | undefined) => string) {
  const compte = new Map<string, number>();
  for (const l of lignes) {
    const v = affiche(colonne, l.valeurs[colonne]) || VIDE;
    compte.set(v, (compte.get(v) ?? 0) + 1);
  }
  return [...compte.entries()]
    .sort(([a], [b]) => (a === VIDE ? 1 : b === VIDE ? -1 : comparer(a, b)))
    .map(([valeur, nombre]) => ({ valeur, nombre }));
}
