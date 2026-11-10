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

/** Toutes les lignes de l'écran Consultants (onglet principal + fiches créées hors Excel), lues en parallèle. */
export async function chargerTableau(supabase: SupabaseClient): Promise<DonneesTableau | null> {
  const { data: onglet } = await supabase.from("tableau_onglets").select("id, entetes, principal").eq("principal", true).maybeSingle();
  if (!onglet) return null;
  const [lignes, horsExcel, docs, competences] = await Promise.all([
    lireTout<LigneTableau>((a, b) => supabase.from("tableau_lignes").select("id, position, consultant_id, valeurs").eq("onglet_id", onglet.id).order("position").range(a, b)),
    supabase.from("consultants").select("id, source, prenom, nom, trigramme, email, email_2, telephone_e164, telephone_brut, intitule_poste, disponibilite, disponible_le, disponibilite_maj_le, localisation, notes, statut, experience, tjm_salaire, linkedin, cv_lien, commentaire_email, colonnes_tableau, created_at")
      .neq("source", "import_excel").order("created_at", { ascending: false }).then((r) => r.data ?? []),
    lireTout<{ consultant_id: string; type: string; url_web: string | null; sharepoint_drive_id: string }>((a, b) => supabase.from("documents").select("consultant_id, type, url_web, sharepoint_drive_id")
      .not("consultant_id", "is", null).eq("supprime_sharepoint", false).in("type", ["word_nominatif", "pdf_anonyme"])
      .order("modifie_sharepoint_le", { ascending: false }).range(a, b)),
    lireTout<{ consultant_id: string; competences: string }>((a, b) => supabase.from("competences_par_consultant").select("consultant_id, competences").range(a, b)),
  ]);

  // Fiches créées hors Excel (emails, CV SharePoint, saisie) pas encore reliées à une ligne : en haut, les plus récentes d'abord.
  const relies = new Set(lignes.map((l) => l.consultant_id).filter(Boolean));
  lignes.unshift(...lignesHorsExcel(horsExcel.filter((c) => !relies.has(c.id)) as FicheHorsExcel[], onglet.entetes, Math.max(0, ...lignes.map((l) => l.position)) + 1));
  // Compétences du CV analysé : cherchables depuis la barre de recherche (« java paris »).
  const parConsultant = new Map(competences.map((c) => [c.consultant_id, c.competences]));
  for (const l of lignes) if (l.consultant_id && parConsultant.has(l.consultant_id)) l.recherche = parConsultant.get(l.consultant_id);

  const documents: Record<string, { word?: string; email?: string; pdf?: string }> = {};
  for (const d of docs) {
    const e = (documents[d.consultant_id] ??= {});
    const parEmail = String(d.sharepoint_drive_id).startsWith("boite:");
    if (d.type === "word_nominatif" && parEmail && !e.email) e.email = d.url_web ?? undefined;
    if (d.type === "word_nominatif" && !parEmail && !e.word) e.word = d.url_web ?? undefined;
    if (d.type === "pdf_anonyme" && !e.pdf) e.pdf = d.url_web ?? undefined;
  }
  const domaines = [...new Set(lignes.flatMap((l) => (l.valeurs[COLONNE_DOMAINE] ?? "").split(" ; ").filter(Boolean)))].sort((a, b) => a.localeCompare(b, "fr"));
  return { ongletId: onglet.id, entetes: onglet.entetes, champs: champsParEntete(onglet.entetes, onglet.entetes), lignes, domaines, documents };
}

/** Les 100 premières lignes (par prénom) pour un affichage immédiat, le temps que le reste arrive. */
export async function chargerApercuTableau(supabase: SupabaseClient): Promise<DonneesTableau | null> {
  const { data: onglet } = await supabase.from("tableau_onglets").select("id, entetes").eq("principal", true).maybeSingle();
  if (!onglet) return null;
  const champs = champsParEntete(onglet.entetes, onglet.entetes);
  const colonnePrenom = Object.entries(champs).find(([, c]) => c === "prenom")?.[0];
  let q = supabase.from("tableau_lignes").select("id, position, consultant_id, valeurs").eq("onglet_id", onglet.id);
  q = colonnePrenom ? q.order(`valeurs->>${colonnePrenom}`, { ascending: true, nullsFirst: false }) : q.order("position");
  const { data } = await q.limit(100);
  return { ongletId: onglet.id, entetes: onglet.entetes, champs, lignes: (data ?? []) as LigneTableau[], domaines: [], documents: {} };
}
