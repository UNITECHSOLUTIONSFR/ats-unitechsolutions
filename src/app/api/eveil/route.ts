import { NextResponse } from "next/server";
import { clientSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Garde le serveur éveillé (appelé toutes les 5 minutes par la base, pg_cron) : sans cela, le premier clic après
 * un moment de calme réveille le serveur et attend 1 à 2 secondes. Ne lit ni ne renvoie aucune donnée.
 */
export async function GET() {
  // Connexion à la base ouverte et gardée chaude elle aussi (requêtes minuscules, sans donnée).
  // Trois requêtes de suite : la 1re mesure l'ouverture de connexion, les suivantes le temps d'un aller-retour (suivi de la vitesse).
  const base = clientSupabaseAdmin();
  const temps: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t = Date.now();
    await base.from("reglages").select("cle", { head: true, count: "exact" }).limit(1).then(() => undefined, () => undefined);
    temps.push(Date.now() - t);
  }
  return new NextResponse(null, { status: 204, headers: { "Server-Timing": temps.map((d, i) => `base${i + 1};dur=${d}`).join(", ") } });
}
