import { NextResponse, type NextRequest } from "next/server";
import { clientSupabaseAdmin } from "@/lib/supabase/admin";
import { autorisationTachesValide } from "@/lib/securite/secret";
import { executerTache, TACHES, type NomTache } from "@/lib/sync/taches";

// Tâches planifiées (vercel.json) : jusqu'à 5 minutes chacune.
export const maxDuration = 300;

/** Appelée par Vercel Cron, qui envoie « Authorization: Bearer CRON_SECRET ». Toute autre requête est refusée. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ tache: string }> }) {
  if (!autorisationTachesValide(request.headers.get("authorization"))) {
    return new NextResponse("Non autorisé", { status: 401 });
  }
  const { tache } = await params;
  if (!(tache in TACHES)) return new NextResponse("Tâche inconnue", { status: 404 });
  const r = await executerTache(tache as NomTache, clientSupabaseAdmin());
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
