import { NextResponse } from "next/server";
import { clientSupabaseServeur, utilisateurConnecte } from "@/lib/supabase/serveur";
import { chargerTableau } from "@/lib/tableau/chargement";

// Données de l'écran Consultants, lues à part : l'écran s'affiche tout de suite, les lignes arrivent ensuite
// (et sont gardées en mémoire dans le navigateur pour les ouvertures suivantes). Règles d'accès de la base appliquées.
export async function GET() {
  const [utilisateur, supabase] = await Promise.all([utilisateurConnecte(), clientSupabaseServeur()]);
  if (!utilisateur || !supabase) return new NextResponse("Non autorisé", { status: 401 });
  const donnees = await chargerTableau(supabase);
  return NextResponse.json(donnees, { headers: { "Cache-Control": "private, no-store" } });
}
