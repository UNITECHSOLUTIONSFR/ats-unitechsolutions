import "server-only";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clientSupabaseAdmin } from "@/lib/supabase/admin";
import { assurerEmpreinteConsultant } from "./empreintes";
import { calculerEtRanger } from "./stockage";

/** Missions les plus proches d'un profil reclassées tout de suite (les autres le sont par la tâche « matching »). */
const MISSIONS_PROCHES = 5;

/**
 * Matching dans les deux sens (17/11/2026) : un profil ajouté ou modifié (fiche, CV) est comparé tout de suite aux missions
 * ouvertes. Son empreinte de sens est recalculée, puis les 5 missions dont il est le plus proche sont reclassées : l'IA le lit
 * et le note s'il entre dans leur présélection. Sa fiche (« missions recommandées ») et ces missions le montrent en 1 à 2 minutes.
 */
export async function evaluerProfil(consultantId: string, supabase: SupabaseClient = clientSupabaseAdmin()): Promise<string[]> {
  if (!(await assurerEmpreinteConsultant(supabase, consultantId).catch(() => false))) return [];
  // Nouveau matching (24/11/2026, option B « vitesse ») : plus de comparaison immédiate ; le CV est comparé à toutes les
  // missions déjà lues par le passage automatique, une fois découpé en expériences.
  if (await (await import("./v4")).matchingV4Actif(supabase)) return [];
  const { data } = await supabase.rpc("missions_proches_consultant", { p_consultant_id: consultantId, p_nombre: MISSIONS_PROCHES });
  const missions = ((data ?? []) as { mission_id: string }[]).map((m) => m.mission_id);
  for (const m of missions) await calculerEtRanger(m, supabase).catch((e) => console.error("Classement :", (e as Error).message));
  return missions;
}

/** À appeler après l'enregistrement d'une fiche ou d'un CV : l'évaluation se fait juste après la réponse. */
export function evaluerProfilApres(consultantId: string): void {
  try {
    after(() => evaluerProfil(consultantId).then(() => undefined).catch((e) => console.error("Matching du profil :", (e as Error).message)));
  } catch { /* hors requête : la tâche « matching » s'en charge */ }
}
