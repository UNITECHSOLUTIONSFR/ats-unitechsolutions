import { NextResponse } from "next/server";
import { utilisateurConnecte } from "@/lib/supabase/serveur";
import { tableauCompresse } from "@/lib/tableau/cache";

// Données de l'écran Consultants : préparées et compressées côté serveur (voir lib/tableau/cache), envoyées telles quelles.
// Réservé aux personnes connectées et actives.
export async function GET() {
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) return new NextResponse("Non autorisé", { status: 401 });
  const donnees = await tableauCompresse();
  if (!donnees) return NextResponse.json(null, { headers: { "Cache-Control": "private, no-store" } });
  return new NextResponse(Buffer.from(donnees, "base64"), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Encoding": "gzip", "Cache-Control": "private, no-store" },
  });
}
