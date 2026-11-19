import { NextResponse, type NextRequest } from "next/server";
import { clientSupabaseServeur, utilisateurConnecte } from "@/lib/supabase/serveur";
import { criteresValides, lirePageTableau } from "@/lib/tableau/page";

/** Une page de l'écran Consultants (50 lignes) selon la recherche, les filtres et le tri. Réservé aux personnes connectées. */
export async function POST(requete: NextRequest) {
  const debut = Date.now();
  const [utilisateur, supabase] = await Promise.all([utilisateurConnecte(), clientSupabaseServeur()]);
  if (!utilisateur || !supabase) return new NextResponse("Non autorisé", { status: 401 });
  const acces = Date.now() - debut;
  try {
    const criteres = criteresValides(await requete.json());
    const page = await lirePageTableau(supabase, criteres);
    // Temps passé sur le serveur (contrôle d'accès, base) : lu par la mesure de vitesse du navigateur.
    return NextResponse.json(page, { headers: { "Cache-Control": "private, no-store", "Server-Timing": `acces;dur=${acces}, total;dur=${Date.now() - debut}` } });
  } catch (e) {
    console.error("Page du tableau :", (e as Error).message);
    return new NextResponse("Lecture impossible", { status: 500 });
  }
}
