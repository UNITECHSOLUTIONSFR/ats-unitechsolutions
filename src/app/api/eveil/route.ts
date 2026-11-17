import { NextResponse } from "next/server";
import { clientSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Garde le serveur éveillé (appelé toutes les 5 minutes par la base, pg_cron) : sans cela, le premier clic après
 * un moment de calme réveille le serveur et attend 1 à 2 secondes. Ne lit ni ne renvoie aucune donnée.
 */
export async function GET() {
  const debut = Date.now();
  // Connexion à la base ouverte et gardée chaude elle aussi (requête minuscule, sans donnée).
  await clientSupabaseAdmin().from("reglages").select("cle", { head: true, count: "exact" }).limit(1).then(() => undefined, () => undefined);
  return new NextResponse(null, { status: 204, headers: { "Server-Timing": `base;dur=${Date.now() - debut}` } });
}
