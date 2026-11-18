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
  action: "consultation" | "creation" | "modification" | "export" | "recherche",
  consultantId: string | null,
  details: Record<string, unknown> = {},
) {
  // Consultation : une seule ligne par personne et par fiche toutes les 5 minutes (la fiche se rafraîchit seule
  // pendant la lecture d'un CV par l'IA : sans cela, une ligne toutes les 3 secondes).
  if (action === "consultation" && consultantId) {
    // Lecture par le serveur (un recruteur ne peut pas lire le journal lui-même).
    const { clientSupabaseAdmin } = await import("@/lib/supabase/admin");
    const { data: recente } = await clientSupabaseAdmin().from("journal_acces").select("id").eq("utilisateur_id", utilisateurId).eq("action", "consultation")
      .eq("consultant_id", consultantId).gte("created_at", new Date(Date.now() - 5 * 60_000).toISOString()).limit(1);
    if (recente?.length) return;
  }
  await supabase.from("journal_acces").insert({ utilisateur_id: utilisateurId, action, consultant_id: consultantId, details });
}
