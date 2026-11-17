import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { entetesUniques, valeurAffichee, type Cellule, type OngletLu } from "@/lib/import/excel";
import { cleContenu, cleStable } from "./modele";

/** Valeurs d'une ligne telles que l'import des fiches les a conservées (sert à relier ligne ↔ fiche). */
function valeursFiche(entetes: string[], l: Cellule[]): Record<string, string> {
  const valeurs: Record<string, string> = {};
  entetes.forEach((e, j) => {
    const v = l[j];
    if (v === null || v === undefined) return;
    const t = (v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).trim();
    if (t !== "") valeurs[e || `Colonne ${j + 1}`] = t;
  });
  return valeurs;
}

export interface BilanTableau {
  onglets: number;
  lignes: number;
  lignesReliees: number;
  /** Lignes ajoutées, modifiées ou retirées (les autres sont restées telles quelles). */
  modifiees?: number;
  erreurs: string[];
}

/** Empreinte d'une ligne (valeurs, ordre des colonnes indifférent, et fiche reliée) : sert à ne réécrire que les lignes changées. */
function empreinteLigne(valeurs: Record<string, string>, consultantId: string | null): string {
  return JSON.stringify([Object.keys(valeurs).sort().map((k) => [k, valeurs[k]]), consultantId ?? null]);
}

/**
 * Met le tableau de suivi à l'image du fichier : mêmes onglets, mêmes en-têtes, même ordre (seules les lignes changées sont réécrites).
 * Le 1er onglet est l'onglet principal : chacune de ses lignes est reliée à sa fiche consultant.
 */
export async function ecrireTableau(supabase: SupabaseClient, onglets: OngletLu[], nomFichier: string): Promise<BilanTableau> {
  const bilan: BilanTableau = { onglets: 0, lignes: 0, lignesReliees: 0, erreurs: [] };

  // Lien ligne Excel → fiche consultant, d'après les lignes d'origine conservées sur chaque fiche.
  const lien = new Map<string, string>();
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await supabase.from("consultants").select("id, donnees_excel").range(debut, debut + 999);
    if (error) throw new Error(error.message);
    for (const c of data ?? []) {
      for (const d of (c.donnees_excel ?? []) as { ligne: number; valeurs: Record<string, string> }[]) {
        lien.set(cleStable(d.ligne, d.valeurs), c.id);
        if (!lien.has(cleContenu(d.valeurs))) lien.set(cleContenu(d.valeurs), c.id);
      }
    }
    if (!data || data.length < 1000) break;
  }

  // Mise à jour EN PLACE (17/11/2026) : seules les lignes changées sont réécrites, les autres gardent leur identifiant.
  // Avant, tout était effacé puis réécrit (≈ 5 000 lignes), ce qui ralentissait la relecture de nuit, vidait le tableau
  // pendant quelques secondes et obligeait à refaire tout l'écran Consultants.
  const { data: existants, error: errOnglets } = await supabase.from("tableau_onglets").select("id, position");
  if (errOnglets) throw new Error(errOnglets.message);
  const ongletParPosition = new Map((existants ?? []).map((o) => [o.position as number, o.id as string]));
  const ongletsGardes = new Set<string>();

  for (const [position, o] of onglets.entries()) {
    if (!o.entetes.length && !o.lignes.length) continue;
    const affiches = entetesUniques(o.entetes);
    const principal = position === 0;
    const champsOnglet = { nom: o.nom, position, entetes: affiches, principal, fichier: nomFichier };
    let ongletId = ongletParPosition.get(position);
    if (ongletId) {
      const { error } = await supabase.from("tableau_onglets").update(champsOnglet).eq("id", ongletId);
      if (error) { bilan.erreurs.push(`Onglet « ${o.nom} » : ${error.message}`); continue; }
    } else {
      const { data: cree, error } = await supabase.from("tableau_onglets").insert(champsOnglet).select("id").single();
      if (error || !cree) { bilan.erreurs.push(`Onglet « ${o.nom} » : ${error?.message}`); continue; }
      ongletId = cree.id as string;
    }
    ongletsGardes.add(ongletId);
    bilan.onglets++;

    const lignes = o.lignes
      .map((l, i) => {
        if (l.every((c) => valeurAffichee(c) === null)) return null;
        const valeurs: Record<string, string> = {};
        affiches.forEach((e, j) => {
          const v = valeurAffichee(l[j]);
          if (v !== null) valeurs[e] = v;
        });
        // Même numérotation que l'import des fiches (index + 2).
        const vf = principal ? valeursFiche(o.entetes, l) : null;
        const consultant_id = vf ? lien.get(cleStable(i + 2, vf)) ?? lien.get(cleContenu(vf)) ?? null : null;
        return { onglet_id: ongletId!, position: (o.numeros[i] ?? i + 2) as number, valeurs, consultant_id };
      })
      .filter((x) => x !== null);

    // Lignes actuelles de l'onglet, par numéro de ligne de l'Excel.
    const actuelles = new Map<number, { id: string; empreinte: string }>();
    const enTrop: string[] = [];
    for (let debut = 0; ; debut += 1000) {
      const { data, error } = await supabase.from("tableau_lignes").select("id, position, valeurs, consultant_id").eq("onglet_id", ongletId).order("id").range(debut, debut + 999);
      if (error) throw new Error(error.message);
      for (const l of data ?? []) {
        const empreinte = empreinteLigne(l.valeurs as Record<string, string>, l.consultant_id as string | null);
        if (actuelles.has(l.position as number)) enTrop.push(l.id as string); else actuelles.set(l.position as number, { id: l.id as string, empreinte });
      }
      if (!data || data.length < 1000) break;
    }
    const aModifier: ((typeof lignes)[number] & { id: string })[] = [];
    const aAjouter: typeof lignes = [];
    const vues = new Set<number>();
    for (const l of lignes) {
      if (vues.has(l.position)) continue; // numéro de ligne en double dans le fichier : la première est gardée
      vues.add(l.position);
      const a = actuelles.get(l.position);
      if (!a) aAjouter.push(l);
      else if (a.empreinte !== empreinteLigne(l.valeurs, l.consultant_id)) aModifier.push({ ...l, id: a.id });
    }
    for (const [pos, a] of actuelles) if (!vues.has(pos)) enTrop.push(a.id);

    for (let i = 0; i < aModifier.length; i += 500) {
      const { error: e } = await supabase.from("tableau_lignes").upsert(aModifier.slice(i, i + 500));
      if (e) bilan.erreurs.push(`Onglet « ${o.nom} », mise à jour ${i / 500 + 1} : ${e.message}`);
    }
    for (let i = 0; i < aAjouter.length; i += 500) {
      const { error: e } = await supabase.from("tableau_lignes").insert(aAjouter.slice(i, i + 500));
      if (e) bilan.erreurs.push(`Onglet « ${o.nom} », ajout ${i / 500 + 1} : ${e.message}`);
    }
    for (let i = 0; i < enTrop.length; i += 200) {
      const { error: e } = await supabase.from("tableau_lignes").delete().in("id", enTrop.slice(i, i + 200));
      if (e) bilan.erreurs.push(`Onglet « ${o.nom} », retrait ${i / 200 + 1} : ${e.message}`);
    }
    bilan.lignes += vues.size;
    bilan.lignesReliees += lignes.filter((l, i, t) => l.consultant_id && t.findIndex((x) => x.position === l.position) === i).length;
    bilan.modifiees = (bilan.modifiees ?? 0) + aModifier.length + aAjouter.length + enTrop.length;
  }
  // Onglets disparus du fichier : retirés (avec leurs lignes).
  const disparus = (existants ?? []).map((o) => o.id as string).filter((id) => !ongletsGardes.has(id));
  if (disparus.length) await supabase.from("tableau_onglets").delete().in("id", disparus);
  return bilan;
}
