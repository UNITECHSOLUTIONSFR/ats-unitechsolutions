import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface Responsable { id: string; nom: string }

/** Personnes invitées et actives (admins et recruteurs) pouvant être responsables d'une mission. */
export async function responsablesPossibles(supabase: SupabaseClient): Promise<Responsable[]> {
  const { data } = await supabase.rpc("responsables_possibles");
  return ((data ?? []) as Responsable[]).map((r) => ({ id: r.id, nom: r.nom }));
}

/** « Mes missions » : celles dont je suis responsable, plus celles encore à assigner (visibles de tous). */
export const FILTRE_MES_MISSIONS = (moi: string) => `responsable_id.eq.${moi},responsable_id.is.null`;
