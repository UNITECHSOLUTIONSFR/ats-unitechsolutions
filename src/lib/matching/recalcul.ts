import "server-only";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clientSupabaseAdmin } from "@/lib/supabase/admin";
import { calculerEtRanger, demanderRecalcul } from "./stockage";

/**
 * Mission modifiée depuis l'écran (exigences, statut) : recalcul demandé, puis lancé juste après la réponse.
 * L'écran affiche l'ancien classement, marqué « mise à jour en cours », jusqu'à la fin du calcul (quelques secondes).
 * Écriture par le serveur uniquement (clé secrète) : le client de l'utilisateur n'est pas utilisé.
 */
export async function recalculerApres(_supabase: SupabaseClient, missionId: string): Promise<void> {
  const admin = clientSupabaseAdmin();
  await demanderRecalcul(admin, [missionId]);
  after(() => calculerEtRanger(missionId, admin).then(() => undefined).catch((e) => console.error("Classement :", (e as Error).message)));
}
