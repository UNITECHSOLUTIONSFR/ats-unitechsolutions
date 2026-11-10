import { NextResponse, type NextRequest } from "next/server";
import { clientSupabaseAdmin } from "@/lib/supabase/admin";
import { traiterFilsGroupe } from "@/lib/emails/groupe";

export const maxDuration = 300;

/**
 * Reprise ponctuelle de l'historique du groupe recrutement@ : reçoit une liste de fils (POST { fils: [{ id, topic }] }).
 * Protégée par CRON_SECRET comme les tâches planifiées.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse("Non autorisé", { status: 401 });
  const { fils } = (await request.json()) as { fils?: { id: string; topic?: string }[] };
  if (!Array.isArray(fils) || !fils.length || fils.length > 200) return new NextResponse("Liste de fils invalide", { status: 400 });
  const r = await traiterFilsGroupe(clientSupabaseAdmin(), fils, Date.now() + 240_000);
  return NextResponse.json(r);
}
