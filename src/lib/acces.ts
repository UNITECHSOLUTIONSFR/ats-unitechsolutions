import "server-only";
import { redirect } from "next/navigation";
import { clientSupabaseServeur, utilisateurConnecte, type UtilisateurConnecte } from "@/lib/supabase/serveur";
import type { SupabaseClient } from "@supabase/supabase-js";

/** À appeler en tête de chaque page et de chaque action serveur : exige un utilisateur invité et actif. */
export async function exigerUtilisateur(): Promise<{ utilisateur: UtilisateurConnecte; supabase: SupabaseClient }> {
  const utilisateur = await utilisateurConnecte();
  const supabase = await clientSupabaseServeur();
  if (!utilisateur || !supabase) redirect("/");
  return { utilisateur, supabase };
}

/** Trace une consultation, une modification ou un export de fiche dans le journal d'accès. */
export async function journaliser(
  supabase: SupabaseClient,
  utilisateurId: string,
  action: "consultation" | "creation" | "modification" | "export",
  consultantId: string | null,
  details: Record<string, unknown> = {},
) {
  await supabase.from("journal_acces").insert({ utilisateur_id: utilisateurId, action, consultant_id: consultantId, details });
}
