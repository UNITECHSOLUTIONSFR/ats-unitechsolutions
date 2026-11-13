"use server";

import { revalidatePath } from "next/cache";
import { invaliderTableau } from "@/lib/tableau/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { exigerUtilisateur } from "@/lib/acces";
import { champsParEntete } from "@/lib/import/excel";
import { majFicheDepuisCellule } from "./modele";
import { PREFIXE_HORS_EXCEL } from "./hors-excel";

export interface ResultatModification {
  ok: boolean;
  message: string;
  lignes?: number;
}

const CHAMPS_UNIQUES = new Set(["email"]);

/**
 * Modifie la colonne `colonne` des lignes `ids` (une cellule ou un traitement en masse).
 * - Lignes de l'Excel : la copie de l'Excel est modifiée, et la fiche reliée aussi (avec historique).
 * - Fiches ajoutées hors Excel (id « fiche:… ») : la modification va directement dans la fiche
 *   (champ dédié, ou « colonnes_tableau » pour une colonne sans champ dédié).
 */
export async function modifierCellules(ids: string[], colonne: string, valeur: string): Promise<ResultatModification> {
  const { utilisateur, supabase } = await exigerUtilisateur();
  if (!ids.length) return { ok: false, message: "Aucune ligne sélectionnée." };
  if (ids.length > 5000) return { ok: false, message: "Trop de lignes à la fois (5 000 maximum)." };

  const idsTableau = ids.filter((id) => !id.startsWith(PREFIXE_HORS_EXCEL));
  const fichesHorsExcel = ids.filter((id) => id.startsWith(PREFIXE_HORS_EXCEL)).map((id) => id.slice(PREFIXE_HORS_EXCEL.length));

  const { data: onglet } = await supabase.from("tableau_onglets").select("entetes").eq("principal", true).maybeSingle();
  if (!onglet) return { ok: false, message: "Tableau introuvable." };
  if (!onglet.entetes.includes(colonne)) return { ok: false, message: "Colonne inconnue." };

  const champ = champsParEntete(onglet.entetes, onglet.entetes)[colonne];
  const maj = champ ? majFicheDepuisCellule(champ, valeur) : null;
  if (champ === "nom" && !valeur.trim()) return { ok: false, message: "Le nom ne peut pas être vide." };
  if (champ && CHAMPS_UNIQUES.has(champ) && ids.length > 1 && valeur.trim()) {
    return { ok: false, message: "Un même email ne peut pas être donné à plusieurs personnes." };
  }

  // 1. Lignes de l'Excel : copie de l'Excel, puis fiches reliées.
  const consultants: string[] = [];
  if (idsTableau.length) {
    const { error } = await supabase.rpc("tableau_modifier", { p_ids: idsTableau, p_colonne: colonne, p_valeur: valeur });
    if (error) return { ok: false, message: `Modification impossible : ${error.message}` };
    if (maj) {
      for (let i = 0; i < idsTableau.length; i += 200) {
        const { data } = await supabase.from("tableau_lignes").select("consultant_id").in("id", idsTableau.slice(i, i + 200)).not("consultant_id", "is", null);
        consultants.push(...(data ?? []).map((d) => d.consultant_id as string));
      }
    }
  }

  // 2. Fiches hors Excel : champ dédié de la fiche, sinon colonne libre.
  if (fichesHorsExcel.length) {
    if (maj) consultants.push(...fichesHorsExcel);
    else {
      const { data: fiches } = await supabase.from("consultants").select("id, colonnes_tableau").in("id", fichesHorsExcel);
      for (const f of fiches ?? []) {
        const colonnes = { ...((f.colonnes_tableau as Record<string, string>) ?? {}) };
        if (valeur.trim()) colonnes[colonne] = valeur.trim(); else delete colonnes[colonne];
        await supabase.from("consultants").update({ colonnes_tableau: colonnes }).eq("id", f.id);
      }
    }
  }

  if (maj && consultants.length) {
    const erreur = await mettreAJourFiches(supabase, consultants, maj, colonne, utilisateur.id);
    if (erreur) return { ok: false, message: idsTableau.length ? `Tableau modifié, mais fiche non mise à jour : ${erreur}.` : `Fiche non mise à jour : ${erreur}.` };
  }

  invaliderTableau();

  revalidatePath("/consultants");
  return { ok: true, message: `${ids.length} ligne(s) modifiée(s).`, lignes: ids.length };
}

/** Met à jour les fiches, avec historique et journal d'accès. Renvoie un message d'erreur ou null. */
async function mettreAJourFiches(
  supabase: SupabaseClient,
  consultants: string[],
  maj: Record<string, unknown>,
  colonne: string,
  utilisateurId: string,
): Promise<string | null> {
  const champsMaj = Object.keys(maj);
  for (let i = 0; i < consultants.length; i += 200) {
    const lot = consultants.slice(i, i + 200);
    const { data: avant } = await supabase.from("consultants").select(["id", ...champsMaj].join(", ")).in("id", lot);
    const { error } = await supabase.from("consultants").update(maj).in("id", lot);
    if (error) return /consultants_email_unique/.test(error.message) ? "cet email est déjà utilisé par une autre fiche" : error.message;
    const historique = ((avant ?? []) as unknown as Record<string, unknown>[]).map((a) => ({
      consultant_id: a.id,
      source: "tableau_suivi",
      par: utilisateurId,
      modifications: Object.fromEntries(champsMaj.map((k) => [k, { avant: a[k] ?? null, apres: maj[k] }])),
    }));
    if (historique.length) await supabase.from("consultants_historique").insert(historique);
    await supabase.from("journal_acces").insert(
      lot.map((id) => ({ utilisateur_id: utilisateurId, action: "modification", consultant_id: id, details: { tableau: colonne } })),
    );
  }
  return null;
}
