import { after, NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { recalculerEnAttente } from "@/lib/matching/stockage";
import { actualiserProjection } from "@/lib/tableau/projection";
import { clientSupabaseAdmin } from "@/lib/supabase/admin";
import { autorisationTachesValide } from "@/lib/securite/secret";
import { poursuivreEnvoi } from "@/lib/relance/declenchement";
import { executerTache, TACHES, type NomTache } from "@/lib/sync/taches";

// Tâches planifiées (vercel.json) : jusqu'à 5 minutes chacune.
export const maxDuration = 300;

/** Appelée par les planificateurs (GitHub, Supabase), qui envoient « Authorization: Bearer CRON_SECRET ». Toute autre requête est refusée. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ tache: string }> }) {
  if (!autorisationTachesValide(request.headers.get("authorization"))) {
    return new NextResponse("Non autorisé", { status: 401 });
  }
  const { tache } = await params;
  // Classements des missions (toutes les 10 minutes) : seulement ce qui est à refaire, sans trace dans le journal des tâches.
  if (tache === "matching") {
    // Par sécurité, la projection de l'écran Consultants est aussi remise à jour (seules les lignes changées sont réécrites).
    const projection = await actualiserProjection().catch((e) => ({ erreur: (e as Error).message }));
    return NextResponse.json({ classements: await recalculerEnAttente(clientSupabaseAdmin(), 200_000), projection });
  }
  if (!(tache in TACHES)) return new NextResponse("Tâche inconnue", { status: 404 });
  const supabase = clientSupabaseAdmin();
  // Tâches planifiées (GitHub ou Supabase) : pas de double passage. La relance, lancée par un administrateur, n'est pas concernée.
  const r = await executerTache(tache as NomTache, supabase, { planifiee: tache !== "relance" });
  // Nouvelles fiches possibles : accueil rafraîchi et projection de l'écran Consultants mise à jour après la réponse.
  // Les classements des missions, rangés dans la base, sont refaits par la tâche « matching ».
  if (tache !== "relance") revalidateTag("accueil", "max");
  if (tache === "excel" || tache === "excel_lecture" || tache === "emails" || tache === "cv") after(() => actualiserProjection().then(() => undefined).catch(() => undefined));
  // Relance lancée par un administrateur : tant qu'il reste des emails à envoyer, l'appel suivant est enchaîné.
  if (tache === "relance" && r.ok && Number(r.rapport.envoyes ?? 0) > 0) after(poursuivreEnvoi);
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
