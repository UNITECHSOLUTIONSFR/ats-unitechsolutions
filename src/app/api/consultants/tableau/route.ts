import { gunzipSync } from "node:zlib";
import { NextResponse } from "next/server";
import { utilisateurConnecte } from "@/lib/supabase/serveur";
import { clientSupabaseAdmin } from "@/lib/supabase/admin";
import { chargerTableau } from "@/lib/tableau/chargement";
import { tableauCompresse } from "@/lib/tableau/cache";

// Données de l'écran Consultants, préparées côté serveur (voir lib/tableau/cache).
// Envoyées en JSON simple : l'hébergeur les compresse lui-même pour le navigateur.
// Si la version préparée est indisponible, elles sont relues directement dans la base (plus lent, jamais d'échec).
// Réservé aux personnes connectées et actives.
export async function GET() {
  const utilisateur = await utilisateurConnecte();
  if (!utilisateur) return new NextResponse("Non autorisé", { status: 401 });
  const entetes = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store" };
  try {
    const donnees = await tableauCompresse();
    if (donnees) return new NextResponse(gunzipSync(Buffer.from(donnees, "base64")), { headers: entetes });
  } catch (e) {
    console.error("Tableau préparé indisponible, relecture directe :", (e as Error).message);
  }
  const d = await chargerTableau(clientSupabaseAdmin());
  return new NextResponse(JSON.stringify(d), { headers: entetes });
}
