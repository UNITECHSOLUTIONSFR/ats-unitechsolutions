import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { corrigerOngletPrincipal, fusionnerOnglets, lireOnglets, preparerImport } from "@/lib/import/excel";
import { ecrireFiches, type BilanEcriture } from "@/lib/import/ecriture";
import { ecrireTableau } from "@/lib/tableau/ecriture";
import { graphGet, SHAREPOINT, trouverBibliotheque } from "@/lib/sharepoint";
import { ajouterFichesAuFichierExcel, type BilanVersExcel } from "./vers-excel";

const ETAT = "excel:suivi";

export interface BilanSynchroExcel {
  inchange: boolean;
  versExcel?: BilanVersExcel;
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
export async function synchroniserExcel(supabase: SupabaseClient): Promise<BilanSynchroExcel> {
  const versExcel = await ajouterFichesAuFichierExcel(supabase);
  const driveId = await trouverBibliotheque();
  const chemin = SHAREPOINT.fichierSuivi.split("/").map(encodeURIComponent).join("/");
  const meta = await graphGet<{ lastModifiedDateTime: string }>(`drives/${driveId}/root:/${chemin}?$select=lastModifiedDateTime`);
  const { data: etat } = await supabase.from("sharepoint_etat").select("lien_delta").eq("drive_id", ETAT).maybeSingle();
  if (etat?.lien_delta === meta.lastModifiedDateTime) return { inchange: true, versExcel, modifieLe: meta.lastModifiedDateTime };

  const contenu = await graphGet<Buffer>(`drives/${driveId}/root:/${chemin}:/content`, { brut: true });
  const onglets = await lireOnglets(new Uint8Array(contenu));
  if (!onglets.length) throw new Error("fichier Excel vide");
  const principal = corrigerOngletPrincipal(fusionnerOnglets(onglets).onglet);
  const { fiches } = preparerImport(principal.entetes, principal.lignes);
  const bilanFiches = await ecrireFiches(supabase, fiches, null, { excelFaitFoi: true });
  const bilanTableau = await ecrireTableau(supabase, [principal], "Sourcing_General_par_metier.xlsx (synchronisation)");

  await supabase.from("sharepoint_etat").upsert({ drive_id: ETAT, lien_delta: meta.lastModifiedDateTime });
  return { inchange: false, versExcel, modifieLe: meta.lastModifiedDateTime, fiches: bilanFiches, lignesTableau: bilanTableau.lignes };
}
