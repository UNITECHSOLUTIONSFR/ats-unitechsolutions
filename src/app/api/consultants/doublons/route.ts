import { NextResponse, type NextRequest } from "next/server";
import { clientSupabaseServeur, utilisateurConnecte } from "@/lib/supabase/serveur";

/**
 * Fiches existantes au même prénom et nom (sans tenir compte des accents ni des majuscules), pour prévenir
 * avant de créer un doublon. Réservé aux personnes connectées ; renvoie seulement l'identifiant, le nom et le poste.
 */
export async function GET(requete: NextRequest) {
  const [utilisateur, supabase] = await Promise.all([utilisateurConnecte(), clientSupabaseServeur()]);
  if (!utilisateur || !supabase) return new NextResponse("Non autorisé", { status: 401 });
  const prenom = (requete.nextUrl.searchParams.get("prenom") ?? "").trim().slice(0, 80);
  const nom = (requete.nextUrl.searchParams.get("nom") ?? "").trim().slice(0, 80);
  if (nom.length < 2) return NextResponse.json([]);
  const { data } = await supabase.rpc("fiches_meme_nom", { p_prenom: prenom, p_nom: nom });
  return NextResponse.json(data ?? [], { headers: { "Cache-Control": "private, no-store" } });
}
