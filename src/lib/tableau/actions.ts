"use server";

import { revalidatePath } from "next/cache";
import { exigerUtilisateur } from "@/lib/acces";
import { champsParEntete } from "@/lib/import/excel";
import { majFicheDepuisCellule } from "./modele";

export interface ResultatModification {
  ok: boolean;
  message: string;
  lignes?: number;
}

const CHAMPS_UNIQUES = new Set(["email"]);

/**
 * Modifie la colonne `colonne` des lignes `ids` (une cellule ou un traitement en masse).
 * Sur l'onglet principal, la fiche consultant reliée est mise à jour en même temps, avec historique.
 */
export async function modifierCellules(ids: string[], colonne: string, valeur: string): Promise<ResultatModification> {
  const { utilisateur, supabase } = await exigerUtilisateur();
  if (!ids.length) return { ok: false, message: "Aucune ligne sélectionnée." };
  if (ids.length > 5000) return { ok: false, message: "Trop de lignes à la fois (5 000 maximum)." };

  const { data: lignes, error } = await supabase
    .from("tableau_lignes")
    .select("id, consultant_id, onglet_id, tableau_onglets(entetes, principal)")
    .in("id", ids.slice(0, 1));
  if (error || !lignes?.length) return { ok: false, message: "Ligne introuvable." };
  const onglet = lignes[0].tableau_onglets as unknown as { entetes: string[]; principal: boolean };
  if (!onglet.entetes.includes(colonne)) return { ok: false, message: "Colonne inconnue." };

  const champ = onglet.principal ? champsParEntete(onglet.entetes, onglet.entetes)[colonne] : undefined;
  const maj = champ ? majFicheDepuisCellule(champ, valeur) : null;
  if (champ === "nom" && !valeur.trim()) return { ok: false, message: "Le nom ne peut pas être vide." };
  if (champ && CHAMPS_UNIQUES.has(champ) && ids.length > 1 && valeur.trim()) {
    return { ok: false, message: "Un même email ne peut pas être donné à plusieurs personnes." };
  }

  const { data: n, error: errMaj } = await supabase.rpc("tableau_modifier", { p_ids: ids, p_colonne: colonne, p_valeur: valeur });
  if (errMaj) return { ok: false, message: `Modification impossible : ${errMaj.message}` };

  if (maj) {
    const consultants: string[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await supabase.from("tableau_lignes").select("consultant_id").in("id", ids.slice(i, i + 200)).not("consultant_id", "is", null);
      consultants.push(...(data ?? []).map((d) => d.consultant_id as string));
    }
    const champsMaj = Object.keys(maj);
    for (let i = 0; i < consultants.length; i += 200) {
      const lot = consultants.slice(i, i + 200);
      const { data: avant } = await supabase.from("consultants").select(["id", ...champsMaj].join(", ")).in("id", lot);
      const { error: e } = await supabase.from("consultants").update(maj).in("id", lot);
      if (e) {
        const msg = /consultants_email_unique/.test(e.message) ? "cet email est déjà utilisé par une autre fiche" : e.message;
        return { ok: false, message: `Tableau modifié, mais fiche non mise à jour : ${msg}.` };
      }
      const historique = ((avant ?? []) as unknown as Record<string, unknown>[]).map((a) => ({
        consultant_id: a.id,
        source: "tableau_suivi",
        par: utilisateur.id,
        modifications: Object.fromEntries(champsMaj.map((k) => [k, { avant: a[k] ?? null, apres: maj[k] }])),
      }));
      if (historique.length) await supabase.from("consultants_historique").insert(historique);
      await supabase.from("journal_acces").insert(
        lot.map((id) => ({ utilisateur_id: utilisateur.id, action: "modification", consultant_id: id, details: { tableau: colonne } })),
      );
    }
  }

  revalidatePath("/consultants");
  return { ok: true, message: `${n ?? ids.length} ligne(s) modifiée(s).`, lignes: n ?? ids.length };
}
