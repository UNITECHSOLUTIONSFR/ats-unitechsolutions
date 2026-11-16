import { NextResponse, type NextRequest } from "next/server";
import { clientSupabaseServeur, utilisateurConnecte } from "@/lib/supabase/serveur";
import { criteresValides, lireValeursColonne } from "@/lib/tableau/page";

/** Valeurs d'une colonne avec leur nombre (filtre façon Excel), selon les autres critères de l'écran. */
export async function POST(requete: NextRequest) {
  const [utilisateur, supabase] = await Promise.all([utilisateurConnecte(), clientSupabaseServeur()]);
  if (!utilisateur || !supabase) return new NextResponse("Non autorisé", { status: 401 });
  try {
    const corps = (await requete.json()) as { criteres?: unknown; colonne?: unknown };
    const colonne = String(corps.colonne ?? "").slice(0, 200);
    if (!colonne) return new NextResponse("Colonne manquante", { status: 400 });
    return NextResponse.json(await lireValeursColonne(supabase, criteresValides(corps.criteres), colonne), { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("Valeurs du tableau :", (e as Error).message);
    return new NextResponse("Lecture impossible", { status: 500 });
  }
}
