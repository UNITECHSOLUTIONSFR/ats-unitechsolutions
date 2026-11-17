import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { graphEnvoyer, graphGet, SHAREPOINT, trouverBibliotheque } from "@/lib/sharepoint";
import { champsParEntete } from "@/lib/import/excel";
import { normaliserNomPersonne } from "@/lib/metier/texte";
import { lignesHorsExcel, type FicheHorsExcel } from "@/lib/tableau/hors-excel";
import { REGLAGE_COLONNES_AJOUTEES } from "@/lib/import/annexe";

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

/** Onglet principal du fichier de suivi (1er onglet) : adresse Graph, en-têtes et dernière ligne utilisée. */
async function ongletPrincipal() {
  const driveId = await trouverBibliotheque();
  const chemin = SHAREPOINT.fichierSuivi.split("/").map(encodeURIComponent).join("/");
  const item = await graphGet<{ id: string }>(`drives/${driveId}/root:/${chemin}?$select=id`);
  const base = `drives/${driveId}/items/${item.id}/workbook`;
  const feuilles = await graphGet<{ value: { name: string; position: number }[] }>(`${base}/worksheets?$select=name,position`);
  const f = `${base}/worksheets/${encodeURIComponent(feuilles.value.sort((a, b) => a.position - b.position)[0].name)}`;
  const { address, values } = await graphGet<{ address: string; values: unknown[][] }>(`${f}/usedRange(valuesOnly=true)?$select=address,values`);
  return { f, values, entetes: (values[0] ?? []).map((v) => String(v ?? "")), derniere: Number(/(\d+)$/.exec(address)?.[1] ?? values.length) };
}

/**
 * Colonnes ajoutées à la base lors d'un import de fichier : créées en fin de 1re ligne du fichier de suivi si elles n'y sont pas
 * (sinon la relecture de nuit les ferait disparaître du tableau). Seul l'en-tête est écrit ; rien n'est modifié.
 */
async function assurerColonnes(supabase: SupabaseClient, f: string, entetes: string[]): Promise<string[]> {
  const { data } = await supabase.from("reglages").select("valeur").eq("cle", REGLAGE_COLONNES_AJOUTEES).maybeSingle();
  const voulues = Array.isArray(data?.valeur) ? (data!.valeur as string[]) : [];
  const manquantes = voulues.filter((c) => !entetes.includes(c));
  if (!manquantes.length) return entetes;
  const debut = entetes.length + 1;
  await graphEnvoyer("PATCH", `${f}/range(address='${lettreColonne(debut)}1:${lettreColonne(debut + manquantes.length - 1)}1')`, { values: [manquantes] });
  return [...entetes, ...manquantes];
}

/** Synchronisation de nuit : crée dans le fichier de suivi les colonnes ajoutées par import (s'il y en a). */
export async function colonnesAjouteesDansExcel(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase.from("reglages").select("valeur").eq("cle", REGLAGE_COLONNES_AJOUTEES).maybeSingle();
  if (!Array.isArray(data?.valeur) || !data.valeur.length) return 0;
  const o = await ongletPrincipal();
  return (await assurerColonnes(supabase, o.f, o.entetes)).length - o.entetes.length;
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

  const o = await ongletPrincipal();
  const f = o.f;
  const derniere = o.derniere;
  const entetes = await assurerColonnes(supabase, f, o.entetes);
  const colonnes = entetes.length;

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
 * Recopie dans le fichier Excel les valeurs modifiées dans l'ATS (sinon la relecture de l'Excel, qui fait foi pendant la transition,
 * remettrait l'ancienne valeur) :
 * - disponibilité mise à jour par une réponse à la relance (la case est remplacée) ;
 * - cases remplies par un import de fichier (« cellules ») : écrites SEULEMENT si la case de l'Excel est vide.
 * La ligne de la personne est retrouvée par email, sinon prénom + nom unique.
 */
export async function recopierDisponibilitesDansExcel(
  supabase: SupabaseClient, budgetMs = 90_000,
): Promise<{ recopiees: number; introuvables: number; restantes: number }> {
  const debut = Date.now();
  const { data: fiches } = await supabase.from("consultants").select("id, prenom, nom, email, excel_maj_en_attente").not("excel_maj_en_attente", "is", null);
  if (!fiches?.length) return { recopiees: 0, introuvables: 0, restantes: 0 };

  const o = await ongletPrincipal();
  const { f, values } = o;
  const entetes = await assurerColonnes(supabase, f, o.entetes);
  const champs = champsParEntete(entetes, entetes);
  const col = (c: string) => entetes.findIndex((e) => champs[e] === c);
  const [cDispo, cEmail, cPrenom, cNom] = [col("disponibilite"), col("email"), col("prenom"), col("nom")];

  const cle = (p: unknown, n: unknown) => normaliserNomPersonne(String(p ?? ""), String(n ?? ""));
  const parEmail = new Map<string, number>(), parNom = new Map<string, number[]>();
  values.forEach((l, i) => {
    if (i === 0) return;
    const e = cEmail >= 0 ? String(l[cEmail] ?? "").trim().toLowerCase() : "";
    if (e) parEmail.set(e, i + 1);
    if (cNom >= 0) { const k = cle(cPrenom >= 0 ? l[cPrenom] : "", l[cNom]); parNom.set(k, [...(parNom.get(k) ?? []), i + 1]); }
  });

  // Une ligne = un appel Microsoft : au-delà du budget, le reste attend la nuit suivante
  // (sinon la tâche dépasse 5 minutes et la relecture de l'Excel n'a jamais lieu).
  let recopiees = 0, introuvables = 0, restantes = 0;
  for (const fiche of fiches) {
    if (Date.now() - debut > budgetMs) { restantes++; continue; }
    const attente = fiche.excel_maj_en_attente as { disponibilite?: string; cellules?: Record<string, string>; ecraser?: string[] };
    // Cases modifiées dans l'outil (fiche ou tableau) : elles REMPLACENT la valeur de l'Excel (décision du 17/11/2026).
    const ecraser = new Set(attente.ecraser ?? []);
    const homonymes = parNom.get(cle(fiche.prenom, fiche.nom)) ?? [];
    const ligne = (fiche.email && parEmail.get(fiche.email)) || (homonymes.length === 1 ? homonymes[0] : null);
    if (!ligne) { introuvables++; continue; }
    // Toutes les cases de la ligne en UNE demande à Microsoft (au lieu d'une par case) : les cases à ne pas toucher
    // sont envoyées vides (« null »), ce que l'Excel ignore.
    const aEcrire = new Map<number, string>();
    if (attente.disponibilite && cDispo >= 0) aEcrire.set(cDispo, attente.disponibilite);
    for (const [entete, v] of Object.entries(attente.cellules ?? {})) {
      const c = entetes.indexOf(entete);
      if (c < 0) continue;
      const actuelle = values[ligne - 1]?.[c];
      if (ecraser.has(entete)) {
        if (String(actuelle ?? "") === v) continue; // déjà à jour
      } else {
        // Cases remplies par un import de fichier : jamais d'écrasement.
        if (!v) continue;
        if (actuelle !== null && actuelle !== undefined && String(actuelle).trim() !== "") continue;
      }
      aEcrire.set(c, v);
    }
    if (aEcrire.size) {
      const premiere = Math.min(...aEcrire.keys()), derniere = Math.max(...aEcrire.keys());
      const colonnes = Array.from({ length: derniere - premiere + 1 }, (_, i) => premiere + i);
      await graphEnvoyer("PATCH", `${f}/range(address='${lettreColonne(premiere + 1)}${ligne}:${lettreColonne(derniere + 1)}${ligne}')`, {
        values: [colonnes.map((c) => (aEcrire.has(c) ? aEcrire.get(c)! : null))],
        numberFormat: [colonnes.map((c) => (aEcrire.has(c) ? "@" : null))],
      });
    }
    await supabase.from("consultants").update({ excel_maj_en_attente: null }).eq("id", fiche.id);
    recopiees++;
  }
  return { recopiees, introuvables, restantes };
}
