import { NextResponse, type NextRequest } from "next/server";
import { clientSupabaseAdmin } from "@/lib/supabase/admin";
import { autorisationTachesValide } from "@/lib/securite/secret";
import { genererCVUnitech } from "@/lib/cv-unitech/service";

export const maxDuration = 300;

/**
 * Essais de rendu des CV Unitech (avant validation) : POST { consultants: [{ id, missionId? }] } ; fichiers déposés
 * uniquement dans le dossier d'essais. Protégé par CRON_SECRET. À retirer une fois le rendu validé.
 */
export async function POST(request: NextRequest) {
  if (!autorisationTachesValide(request.headers.get("authorization"))) return new NextResponse("Non autorisé", { status: 401 });
  const { consultants } = (await request.json()) as { consultants?: { id: string; missionId?: string }[] };
  if (!Array.isArray(consultants) || !consultants.length || consultants.length > 4) return new NextResponse("1 à 4 consultants par appel", { status: 400 });
  const supabase = clientSupabaseAdmin();
  const resultats = [];
  for (const c of consultants) {
    try { resultats.push({ id: c.id, ok: true, ...(await genererCVUnitech(supabase, c.id, { missionId: c.missionId, essai: true })) }); }
    catch (e) { resultats.push({ id: c.id, ok: false, erreur: (e as Error).message.slice(0, 200) }); }
  }
  return NextResponse.json(resultats);
}
