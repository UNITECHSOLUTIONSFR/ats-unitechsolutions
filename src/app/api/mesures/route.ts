import { NextResponse, type NextRequest } from "next/server";
import { utilisateurConnecte } from "@/lib/supabase/serveur";
import { clientSupabaseAdmin } from "@/lib/supabase/admin";

/** Temps d'affichage d'un écran, envoyé par le navigateur (personnes connectées seulement). Aucune donnée personnelle. */
export async function POST(requete: NextRequest) {
  // Copie de test locale branchée sur la vraie base : ses mesures ne doivent pas se mêler à celles de l'équipe.
  if (process.env.APERCU_LOCAL === "1") return new NextResponse(null, { status: 204 });
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) return new NextResponse(null, { status: 204 });
  try {
    const m = (await requete.json()) as { ecran?: unknown; duree?: unknown; type?: unknown };
    const ecran = String(m.ecran ?? "").replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "[id]").replace(/\d{5,}/g, "#").slice(0, 120);
    const duree = Math.round(Number(m.duree));
    const type = m.type === "ouverture" || m.type === "action" ? m.type : "navigation";
    if (ecran.startsWith("/") && duree >= 0 && duree <= 120_000) {
      await clientSupabaseAdmin().from("mesures_ecrans").insert({ ecran, duree_ms: duree, type, role: utilisateur.role });
    }
  } catch { /* mesure perdue : sans importance */ }
  return new NextResponse(null, { status: 204 });
}
