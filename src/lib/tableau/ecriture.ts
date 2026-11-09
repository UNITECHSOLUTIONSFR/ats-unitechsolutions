import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { entetesUniques, valeurAffichee, type Cellule, type OngletLu } from "@/lib/import/excel";
import { cleStable } from "./modele";

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
  erreurs: string[];
}

/**
 * Remplace le tableau de suivi par le contenu du fichier : mêmes onglets, mêmes en-têtes, même ordre.
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
      }
    }
    if (!data || data.length < 1000) break;
  }

  const { error: errSuppr } = await supabase.from("tableau_onglets").delete().not("id", "is", null);
  if (errSuppr) throw new Error(errSuppr.message);

  for (const [position, o] of onglets.entries()) {
    if (!o.entetes.length && !o.lignes.length) continue;
    const affiches = entetesUniques(o.entetes);
    const principal = position === 0;
    const { data: onglet, error } = await supabase
      .from("tableau_onglets")
      .insert({ nom: o.nom, position, entetes: affiches, principal, fichier: nomFichier })
      .select("id")
      .single();
    if (error || !onglet) {
      bilan.erreurs.push(`Onglet « ${o.nom} » : ${error?.message}`);
      continue;
    }
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
        const consultant_id = principal ? lien.get(cleStable(i + 2, valeursFiche(o.entetes, l))) ?? null : null;
        return { onglet_id: onglet.id, position: o.numeros[i] ?? i + 2, valeurs, consultant_id };
      })
      .filter((x) => x !== null);

    for (let i = 0; i < lignes.length; i += 500) {
      const lot = lignes.slice(i, i + 500);
      const { error: e } = await supabase.from("tableau_lignes").insert(lot);
      if (e) bilan.erreurs.push(`Onglet « ${o.nom} », lot ${i / 500 + 1} : ${e.message}`);
      else {
        bilan.lignes += lot.length;
        bilan.lignesReliees += lot.filter((l) => l.consultant_id).length;
      }
    }
  }
  return bilan;
}
