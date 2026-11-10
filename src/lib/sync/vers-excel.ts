import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { graphEnvoyer, graphGet, SHAREPOINT, trouverBibliotheque } from "@/lib/sharepoint";
import { lignesHorsExcel, type FicheHorsExcel } from "@/lib/tableau/hors-excel";

export interface BilanVersExcel {
  ajoutees: number;
  premiereLigne?: number;
}

/** Lettre de colonne Excel : 1 → A, 15 → O, 27 → AA. */
export function lettreColonne(n: number): string {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

/**
 * Synchronisation ATS → Excel : ajoute à la fin de l'onglet principal du fichier de suivi les fiches créées
 * hors Excel (candidatures email, CV SharePoint, saisie à la main) qui n'y sont pas encore.
 * Seules des lignes sont AJOUTÉES : rien n'est modifié ni supprimé dans le fichier. Chaque fiche n'est ajoutée qu'une fois.
 * La lecture de l'Excel qui suit relie ensuite ces lignes à leur fiche (email, téléphone, ou prénom + nom + trigramme).
 */
export async function ajouterFichesAuFichierExcel(supabase: SupabaseClient): Promise<BilanVersExcel> {
  const { data: fiches } = await supabase.from("consultants").select("*")
    .neq("source", "import_excel").is("ajoute_excel_le", null).neq("statut", "inactif").order("created_at");
  const { data: relies } = await supabase.from("tableau_lignes").select("consultant_id").in("consultant_id", (fiches ?? []).map((f) => f.id));
  const dejaDansExcel = new Set((relies ?? []).map((r) => r.consultant_id));
  const aAjouter = (fiches ?? []).filter((f) => !dejaDansExcel.has(f.id)) as (FicheHorsExcel & { id: string })[];
  if (!aAjouter.length) return { ajoutees: 0 };

  const driveId = await trouverBibliotheque();
  const chemin = SHAREPOINT.fichierSuivi.split("/").map(encodeURIComponent).join("/");
  const item = await graphGet<{ id: string }>(`drives/${driveId}/root:/${chemin}?$select=id`);
  const base = `drives/${driveId}/items/${item.id}/workbook`;
  const feuilles = await graphGet<{ value: { name: string; position: number }[] }>(`${base}/worksheets?$select=name,position`);
  const feuille = feuilles.value.sort((a, b) => a.position - b.position)[0];
  const f = `${base}/worksheets/${encodeURIComponent(feuille.name)}`;
  const utilise = await graphGet<{ address: string; columnCount: number }>(`${f}/usedRange(valuesOnly=true)?$select=address,columnCount`);
  const derniere = Number(/(\d+)$/.exec(utilise.address)?.[1] ?? 1);
  const colonnes = utilise.columnCount;
  const entetes = (await graphGet<{ values: unknown[][] }>(`${f}/range(address='A1:${lettreColonne(colonnes)}1')?$select=values`)).values[0].map((v) => String(v ?? ""));

  // Toutes les valeurs sont écrites en texte (le zéro des téléphones est conservé).
  const lignes = lignesHorsExcel(aAjouter, entetes, 0);
  const valeurs = lignes.map((l) => entetes.map((e) => l.valeurs[e] ?? ""));
  const premiere = derniere + 1;
  const plage = `A${premiere}:${lettreColonne(colonnes)}${premiere + valeurs.length - 1}`;
  await graphEnvoyer("PATCH", `${f}/range(address='${plage}')`, { values: valeurs, numberFormat: valeurs.map((r) => r.map(() => "@")) });

  const maintenant = new Date().toISOString();
  for (const [i, fiche] of aAjouter.entries()) {
    const ecrites = Object.fromEntries(Object.entries(lignes[i].valeurs).filter(([e]) => entetes.includes(e)));
    await supabase.from("consultants").update({ ajoute_excel_le: maintenant, donnees_excel: [{ ligne: premiere + i, valeurs: ecrites }] }).eq("id", fiche.id);
  }
  return { ajoutees: aAjouter.length, premiereLigne: premiere };
}
