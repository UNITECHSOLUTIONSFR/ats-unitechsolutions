import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { motsRecherche, type FiltreRapide, type Filtres, type LigneTableau, type Tri } from "./modele";

/** Lignes par page de l'écran Consultants (le navigateur ne reçoit que celles-ci). */
export const PAR_PAGE = 50;

/** Critères de l'écran : recherche, filtres de colonne, filtres rapides, vue du jour, tri et page. */
export interface CriteresTableau {
  filtres: Filtres;
  recherche: string;
  tri: Tri | null;
  rapides: FiltreRapide[];
  vue: string;
  /** Chercher aussi les mots dans le texte des CV. */
  avecCV: boolean;
  page: number;
}
export interface ExtraitCV { extrait: string; source: string }
export interface LigneAffichee extends LigneTableau {
  documents: { word?: string; email?: string; pdf?: string };
  /** Trouvée seulement grâce au texte du CV (le mot n'est dans aucune colonne). */
  par_cv: boolean;
}
export interface PageTableau {
  total: number;
  lignes: LigneAffichee[];
  compteurs: { email_jour: number; sharepoint_jour: number; tout: number };
  /** Extrait du CV des lignes trouvées grâce au CV (par fiche). */
  extraits: Record<string, ExtraitCV>;
}

const RAPIDES: FiltreRapide[] = ["disponibles", "a_verifier", "semaine", "cv", "email_jour", "sharepoint_jour"];

/** Critères reçus du navigateur : vérifiés et bornés (rien d'autre n'est transmis à la base). */
export function criteresValides(brut: unknown): CriteresTableau {
  const c = (brut && typeof brut === "object" ? brut : {}) as Record<string, unknown>;
  const filtres: Filtres = {};
  if (c.filtres && typeof c.filtres === "object") {
    for (const [col, vals] of Object.entries(c.filtres as Record<string, unknown>).slice(0, 40)) {
      if (Array.isArray(vals)) filtres[String(col).slice(0, 200)] = vals.slice(0, 5000).map((v) => String(v).slice(0, 500));
    }
  }
  const t = c.tri as { colonne?: unknown; sens?: unknown } | null;
  return {
    filtres,
    recherche: String(c.recherche ?? "").slice(0, 200),
    tri: t && typeof t.colonne === "string" ? { colonne: t.colonne.slice(0, 200), sens: t.sens === "desc" ? "desc" : "asc" } : null,
    rapides: (Array.isArray(c.rapides) ? c.rapides : []).filter((r): r is FiltreRapide => RAPIDES.includes(r as FiltreRapide)),
    vue: RAPIDES.includes(c.vue as FiltreRapide) ? String(c.vue) : "",
    avecCV: c.avecCV !== false,
    page: Math.max(0, Math.min(10_000, Number(c.page) || 0)),
  };
}

/**
 * Écran Consultants = liste de contacts : la recherche porte uniquement sur les colonnes, jamais sur le texte des CV
 * (décision du 19/11/2026 ; la recherche dans les CV se fait dans l'écran Recherche).
 */
async function rechercheDansCV(): Promise<string[]> {
  return [];
}

function parametres(c: CriteresTableau, idsCV: string[]) {
  const { mots, chiffres } = motsRecherche(c.recherche);
  return { filtres: c.filtres, mots, chiffres, rapides: c.rapides, vue: c.vue, ids_cv: idsCV, tri: c.tri };
}

/** Une page de l'écran Consultants : recherche, filtres et tri faits par la base, sur toutes les lignes. */
export async function lirePageTableau(supabase: SupabaseClient, c: CriteresTableau): Promise<PageTableau> {
  const dansCV = await rechercheDansCV();
  const { data, error } = await supabase.rpc("tableau_page", { p: { ...parametres(c, dansCV), decalage: c.page * PAR_PAGE, limite: PAR_PAGE } });
  if (error) throw new Error(error.message);
  const r = data as Omit<PageTableau, "extraits">;
  // Extrait surligné du CV : seulement pour les lignes affichées trouvées grâce au CV.
  const extraits: Record<string, ExtraitCV> = {};
  const aExtraire = r.lignes.filter((l) => l.par_cv && l.consultant_id).map((l) => l.consultant_id!);
  if (aExtraire.length) {
    const { data: ex } = await supabase.rpc("cv_extraits", { p_texte: c.recherche.trim().slice(0, 100), p_ids: aExtraire });
    for (const e of (ex ?? []) as { consultant_id: string; extrait: string; source: string }[]) extraits[e.consultant_id] = { extrait: e.extrait, source: e.source };
  }
  return { ...r, extraits };
}

/** Valeurs d'une colonne et leur nombre (liste à cocher du filtre), selon les autres critères. */
export async function lireValeursColonne(supabase: SupabaseClient, c: CriteresTableau, colonne: string): Promise<{ valeur: string; nombre: number }[]> {
  const dansCV = await rechercheDansCV();
  const { data, error } = await supabase.rpc("tableau_valeurs", { p: parametres(c, dansCV), p_colonne: colonne });
  if (error) throw new Error(error.message);
  return (data ?? []) as { valeur: string; nombre: number }[];
}

/** Identifiants de toutes les lignes retenues, dans l'ordre affiché (export Excel). */
export async function lireIdsTableau(supabase: SupabaseClient, c: CriteresTableau): Promise<string[]> {
  const dansCV = await rechercheDansCV();
  const { data, error } = await supabase.rpc("tableau_ids", { p: parametres(c, dansCV) });
  if (error) throw new Error(error.message);
  return (data ?? []) as string[];
}
