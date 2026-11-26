import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { COLONNE_DOMAINE, champsParEntete, type ChampFiche } from "@/lib/import/excel";
import { lireTout } from "@/lib/supabase/pages";
import { lignesHorsExcel, type FicheHorsExcel } from "./hors-excel";
import type { LigneTableau } from "./modele";

export interface DonneesTableau {
  ongletId: string;
  entetes: string[];
  champs: Record<string, ChampFiche>;
  lignes: LigneTableau[];
  domaines: string[];
  /** Liens par fiche : CV Word (SharePoint), email reçu (Outlook) quand le CV est venu par email, PDF anonymisé. */
  documents: Record<string, { word?: string; email?: string; pdf?: string }>;
}

/**
 * Mise à jour ciblée (vitesse, 25/11/2026) : seulement les lignes de ces fiches. Les lignes « hors Excel » gardent la
 * position qu'elles ont déjà dans la projection (les positions ne sont recalculées que par la mise à jour complète).
 */
export interface FiltreTableau { ids: string[]; positionsHorsExcel: Map<string, number> }

/** Toutes les lignes de l'écran Consultants (onglet principal + fiches créées hors Excel), lues en parallèle. */
export async function chargerTableau(supabase: SupabaseClient, filtre?: FiltreTableau): Promise<DonneesTableau | null> {
  const { data: onglet } = await supabase.from("tableau_onglets").select("id, entetes, principal").eq("principal", true).maybeSingle();
  if (!onglet) return null;
  const ids = filtre?.ids;
  const CHAMPS_HORS_EXCEL = "id, source, prenom, nom, trigramme, email, email_2, telephone_e164, telephone_brut, intitule_poste, disponibilite, disponible_le, disponibilite_maj_le, localisation, notes, statut, experience, tjm_salaire, linkedin, cv_lien, commentaire_email, colonnes_tableau, created_at";
  const [lignes, horsExcel, docs, competences, reperes] = await Promise.all([
    ids
      ? supabase.from("tableau_lignes").select("id, position, consultant_id, valeurs").eq("onglet_id", onglet.id).in("consultant_id", ids).order("position").then((r) => (r.data ?? []) as LigneTableau[])
      : lireTout<LigneTableau>((a, b) => supabase.from("tableau_lignes").select("id, position, consultant_id, valeurs").eq("onglet_id", onglet.id).order("position").range(a, b)),
    // Toutes les fiches hors Excel, page par page (26/11/2026 : la base n'en renvoie que 1 000 à la fois ; au-delà,
    // les fiches les plus anciennes n'apparaissaient plus dans l'écran Consultants).
    ids
      ? supabase.from("consultants").select(CHAMPS_HORS_EXCEL).neq("source", "import_excel").in("id", ids).order("created_at", { ascending: false }).order("id").then((r) => r.data ?? [])
      : lireTout<Record<string, unknown>>((a, b) => supabase.from("consultants").select(CHAMPS_HORS_EXCEL).neq("source", "import_excel").order("created_at", { ascending: false }).order("id").range(a, b)),
    ids
      ? supabase.from("documents").select("consultant_id, type, url_web, sharepoint_drive_id").in("consultant_id", ids).eq("supprime_sharepoint", false).in("type", ["word_nominatif", "pdf_anonyme"])
        .order("modifie_sharepoint_le", { ascending: false }).then((r) => (r.data ?? []) as { consultant_id: string; type: string; url_web: string | null; sharepoint_drive_id: string }[])
      : lireTout<{ consultant_id: string; type: string; url_web: string | null; sharepoint_drive_id: string }>((a, b) => supabase.from("documents").select("consultant_id, type, url_web, sharepoint_drive_id")
        .not("consultant_id", "is", null).eq("supprime_sharepoint", false).in("type", ["word_nominatif", "pdf_anonyme"])
        .order("modifie_sharepoint_le", { ascending: false }).range(a, b)),
    // Une seule lecture (fonction de la base) : la vue paginée refaisait tout le calcul à chaque page.
    // Mise à jour ciblée : même texte (compétences triées, séparées par « · »), lu seulement pour ces fiches.
    ids
      ? supabase.rpc("competences_consultants_json_ids", { p_ids: ids }).then((r) => {
        if (r.error) throw new Error(`Compétences des consultants : ${r.error.message}`);
        return Object.entries((r.data ?? {}) as Record<string, string>).map(([consultant_id, competences]) => ({ consultant_id, competences }));
      })
      : supabase.rpc("competences_consultants_json").then((r) => {
        if (r.error) throw new Error(`Compétences des consultants : ${r.error.message}`);
        return Object.entries((r.data ?? {}) as Record<string, string>).map(([consultant_id, competences]) => ({ consultant_id, competences }));
      }),
    ids
      ? supabase.from("consultants").select("id, disponibilite, disponible_le, disponibilite_maj_le, created_at, source, statut").in("id", ids).then((r) => (r.data ?? []) as { id: string; disponibilite: string | null; disponible_le: string | null; disponibilite_maj_le: string | null; created_at: string; source: string; statut: string | null }[])
      : lireTout<{ id: string; disponibilite: string | null; disponible_le: string | null; disponibilite_maj_le: string | null; created_at: string; source: string; statut: string | null }>((a, b) =>
        supabase.from("consultants").select("id, disponibilite, disponible_le, disponibilite_maj_le, created_at, source, statut").range(a, b)),
  ]);

  // Fiches créées hors Excel (emails, CV SharePoint, saisie) pas encore reliées à une ligne : en haut, les plus récentes d'abord.
  const relies = new Set(lignes.map((l) => l.consultant_id).filter(Boolean));
  const hors = lignesHorsExcel((horsExcel as unknown as FicheHorsExcel[]).filter((c) => !relies.has(c.id)), onglet.entetes, Math.max(0, ...lignes.map((l) => l.position)) + 1);
  if (filtre) for (const l of hors) { const p = filtre.positionsHorsExcel.get(l.id); if (p === undefined) return null; l.position = p; }
  lignes.unshift(...hors);
  // Compétences du CV analysé : cherchables depuis la barre de recherche (« java paris »).
  const parConsultant = new Map(competences.map((c) => [c.consultant_id, c.competences]));
  const parId = new Map(reperes.map((r) => [r.id, r]));
  for (const l of lignes) {
    if (!l.consultant_id) continue;
    if (parConsultant.has(l.consultant_id)) l.recherche = parConsultant.get(l.consultant_id);
    const r = parId.get(l.consultant_id);
    if (r) l.meta = { dispo: r.disponibilite, dispoLe: r.disponible_le, dispoMaj: r.disponibilite_maj_le, creeLe: r.created_at, source: r.source, cvAnalyse: parConsultant.has(l.consultant_id), statut: r.statut };
  }

  const documents: Record<string, { word?: string; email?: string; pdf?: string }> = {};
  for (const d of docs) {
    const e = (documents[d.consultant_id] ??= {});
    const parEmail = String(d.sharepoint_drive_id).startsWith("boite:");
    // CV reçu par email : seulement s'il a été rangé dans SharePoint (le lien vers la messagerie ne menait nulle part de précis).
    if (d.type === "word_nominatif" && parEmail && !e.email && d.url_web?.includes("sharepoint.com")) e.email = d.url_web;
    if (d.type === "word_nominatif" && !parEmail && !e.word) e.word = d.url_web ?? undefined;
    if (d.type === "pdf_anonyme" && !e.pdf) e.pdf = d.url_web ?? undefined;
  }
  const domaines = [...new Set(lignes.flatMap((l) => (l.valeurs[COLONNE_DOMAINE] ?? "").split(" ; ").filter(Boolean)))].sort((a, b) => a.localeCompare(b, "fr"));
  return { ongletId: onglet.id, entetes: onglet.entetes, champs: champsParEntete(onglet.entetes, onglet.entetes), lignes, domaines, documents };
}
