import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { corrigerOngletPrincipal, fusionnerOnglets, lireOnglets, preparerImport } from "@/lib/import/excel";
import { ecrireFiches, type BilanEcriture } from "@/lib/import/ecriture";
import { ecrireTableau } from "@/lib/tableau/ecriture";
import { graphGet, SHAREPOINT, trouverBibliotheque } from "@/lib/sharepoint";
import { ajouterFichesAuFichierExcel, colonnesAjouteesDansExcel, recopierDisponibilitesDansExcel, type BilanVersExcel } from "./vers-excel";

const ETAT = "excel:suivi";

export interface BilanSynchroExcel {
  inchange: boolean;
  versExcel?: BilanVersExcel;
  disponibilites?: { recopiees: number; introuvables: number; restantes: number };
  /** Relecture laissée à la tâche suivante (manque de temps). */
  relectureReportee?: boolean;
  modifieLe?: string;
  fiches?: BilanEcriture;
  lignesTableau?: number;
}

/**
 * Synchronisation de nuit du fichier Excel Online de suivi, pendant la transition.
 * Même chaîne que l'import manuel (onglets métier fusionnés dans « Domaine », emails corrigés, pas de doublon),
 * mais l'Excel fait foi : ses valeurs remplacent celles des fiches. Rien n'est relu si le fichier n'a pas changé.
 * Avant la lecture, les fiches créées dans l'ATS (emails, CV SharePoint, saisie) sont ajoutées à la fin du fichier.
 */
export async function synchroniserExcel(supabase: SupabaseClient, options: { lecture?: "si_temps" | "toujours" | "jamais" } = {}): Promise<BilanSynchroExcel> {
  const debut = Date.now();
  const lecture = options.lecture ?? "si_temps";
  // Écriture vers l'Excel (sauf tâche de relecture seule).
  let versExcel: BilanVersExcel | undefined, disponibilites: BilanSynchroExcel["disponibilites"];
  if (lecture !== "toujours") {
    // Colonnes ajoutées par un import de fichier : créées dans l'Excel avant tout (sinon la relecture les retirerait du tableau).
    await colonnesAjouteesDansExcel(supabase);
    versExcel = await ajouterFichesAuFichierExcel(supabase);
    // Cases modifiées dans l'outil (fiches, tableau, réponses aux emails) recopiées dans l'Excel avant sa relecture.
    disponibilites = await recopierDisponibilitesDansExcel(supabase);
  }
  // La relecture complète prend environ 3 minutes : elle n'est faite ici que s'il reste le temps (limite de 5 minutes),
  // sinon par la tâche « relecture de l'Excel », 20 minutes plus tard.
  if (lecture === "jamais" || (lecture === "si_temps" && Date.now() - debut > 60_000)) {
    return { inchange: true, versExcel, disponibilites, relectureReportee: true };
  }
  const driveId = await trouverBibliotheque();
  const chemin = SHAREPOINT.fichierSuivi.split("/").map(encodeURIComponent).join("/");
  const meta = await graphGet<{ lastModifiedDateTime: string }>(`drives/${driveId}/root:/${chemin}?$select=lastModifiedDateTime`);
  const { data: etat } = await supabase.from("sharepoint_etat").select("lien_delta").eq("drive_id", ETAT).maybeSingle();
  if (etat?.lien_delta === meta.lastModifiedDateTime) return { inchange: true, versExcel, disponibilites, modifieLe: meta.lastModifiedDateTime };

  const contenu = await graphGet<Buffer>(`drives/${driveId}/root:/${chemin}:/content`, { brut: true });
  const onglets = await lireOnglets(new Uint8Array(contenu));
  if (!onglets.length) throw new Error("fichier Excel vide");
  const principal = corrigerOngletPrincipal(fusionnerOnglets(onglets).onglet);
  const { fiches } = preparerImport(principal.entetes, principal.lignes);
  const bilanFiches = await ecrireFiches(supabase, fiches, null, { excelFaitFoi: true });
  const bilanTableau = await ecrireTableau(supabase, [principal], "Sourcing_General_par_metier.xlsx (synchronisation)");

  await supabase.from("sharepoint_etat").upsert({ drive_id: ETAT, lien_delta: meta.lastModifiedDateTime });
  return { inchange: false, versExcel, disponibilites, modifieLe: meta.lastModifiedDateTime, fiches: bilanFiches, lignesTableau: bilanTableau.lignes };
}
