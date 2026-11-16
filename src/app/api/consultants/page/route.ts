import { NextResponse, type NextRequest } from "next/server";
import { clientSupabaseServeur, utilisateurConnecte } from "@/lib/supabase/serveur";
import { criteresValides, lirePageTableau } from "@/lib/tableau/page";

/** Une page de l'écran Consultants (50 lignes) selon la recherche, les filtres et le tri. Réservé aux personnes connectées. */
export async function POST(requete: NextRequest) {
  const [utilisateur, supabase] = await Promise.all([utilisateurConnecte(), clientSupabaseServeur()]);
  if (!utilisateur || !supabase) return new NextResponse("Non autorisé", { status: 401 });
  try {
    const criteres = criteresValides(await requete.json());
    return NextResponse.json(await lirePageTableau(supabase, criteres), { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("Page du tableau :", (e as Error).message);
    return new NextResponse("Lecture impossible", { status: 500 });
  }
}
