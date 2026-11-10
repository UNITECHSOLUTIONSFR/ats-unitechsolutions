import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { graphEnvoyer, graphGet, SHAREPOINT, trouverBibliotheque } from "@/lib/sharepoint";
import { champsParEntete } from "@/lib/import/excel";
import { normaliserNomPersonne } from "@/lib/metier/texte";
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

/**
 * Relance des disponibilités : recopie dans le fichier Excel les disponibilités mises à jour par les réponses
 * (sinon la relecture de l'Excel, qui fait foi pendant la transition, remettrait l'ancienne valeur).
 * Seule la cellule « Disponibilité » de la ligne de la personne est modifiée (retrouvée par email, sinon prénom + nom unique).
 */
export async function recopierDisponibilitesDansExcel(supabase: SupabaseClient): Promise<{ recopiees: number; introuvables: number }> {
  const { data: fiches } = await supabase.from("consultants").select("id, prenom, nom, email, excel_maj_en_attente").not("excel_maj_en_attente", "is", null);
  if (!fiches?.length) return { recopiees: 0, introuvables: 0 };

  const driveId = await trouverBibliotheque();
  const chemin = SHAREPOINT.fichierSuivi.split("/").map(encodeURIComponent).join("/");
  const item = await graphGet<{ id: string }>(`drives/${driveId}/root:/${chemin}?$select=id`);
  const base = `drives/${driveId}/items/${item.id}/workbook`;
  const feuilles = await graphGet<{ value: { name: string; position: number }[] }>(`${base}/worksheets?$select=name,position`);
  const f = `${base}/worksheets/${encodeURIComponent(feuilles.value.sort((a, b) => a.position - b.position)[0].name)}`;
  const { values } = await graphGet<{ values: unknown[][] }>(`${f}/usedRange(valuesOnly=true)?$select=values`);
  const entetes = (values[0] ?? []).map((v) => String(v ?? ""));
  const champs = champsParEntete(entetes, entetes);
  const col = (c: string) => entetes.findIndex((e) => champs[e] === c);
  const [cDispo, cEmail, cPrenom, cNom] = [col("disponibilite"), col("email"), col("prenom"), col("nom")];
  if (cDispo < 0) return { recopiees: 0, introuvables: fiches.length };

  const cle = (p: unknown, n: unknown) => normaliserNomPersonne(String(p ?? ""), String(n ?? ""));
  const parEmail = new Map<string, number>(), parNom = new Map<string, number[]>();
  values.forEach((l, i) => {
    if (i === 0) return;
    const e = cEmail >= 0 ? String(l[cEmail] ?? "").trim().toLowerCase() : "";
    if (e) parEmail.set(e, i + 1);
    if (cNom >= 0) { const k = cle(cPrenom >= 0 ? l[cPrenom] : "", l[cNom]); parNom.set(k, [...(parNom.get(k) ?? []), i + 1]); }
  });

  let recopiees = 0, introuvables = 0;
  for (const fiche of fiches) {
    const texte = (fiche.excel_maj_en_attente as { disponibilite?: string }).disponibilite;
    const homonymes = parNom.get(cle(fiche.prenom, fiche.nom)) ?? [];
    const ligne = (fiche.email && parEmail.get(fiche.email)) || (homonymes.length === 1 ? homonymes[0] : null);
    if (!ligne || !texte) { introuvables++; continue; }
    const adresse = `${lettreColonne(cDispo + 1)}${ligne}`;
    await graphEnvoyer("PATCH", `${f}/range(address='${adresse}')`, { values: [[texte]], numberFormat: [["@"]] });
    await supabase.from("consultants").update({ excel_maj_en_attente: null }).eq("id", fiche.id);
    recopiees++;
  }
  return { recopiees, introuvables };
}
