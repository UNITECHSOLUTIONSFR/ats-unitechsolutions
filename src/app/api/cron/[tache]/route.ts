import { after, NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { prechaufferClassements, TAG_CLASSEMENTS } from "@/lib/matching/cache";
import { preparerEmpreintes } from "@/lib/matching/empreintes";
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
  if (!(tache in TACHES)) return new NextResponse("Tâche inconnue", { status: 404 });
  const supabase = clientSupabaseAdmin();
  // Tâches planifiées (GitHub ou Supabase) : pas de double passage. La relance, lancée par un administrateur, n'est pas concernée.
  const r = await executerTache(tache as NomTache, supabase, { planifiee: tache !== "relance" });
  // Relance lancée par un administrateur : tant qu'il reste des emails à envoyer, l'appel suivant est enchaîné.
  // Nouvelles fiches possibles : écran Consultants, accueil et classements rafraîchis en arrière-plan
  // (la version actuelle reste servie instantanément pendant le recalcul).
  if (tache !== "relance") for (const t of ["tableau-consultants", "accueil", TAG_CLASSEMENTS]) revalidateTag(t, "max");
  // Missions Trello et nouveaux CV : classements préparés à l'avance, une mission après l'autre, après la réponse.
  // Empreintes de sens manquantes (nouveaux CV, nouvelles missions) calculées d'abord, puis classements préparés.
  if (tache === "trello" || tache === "emails" || tache === "cv") after(async () => {
    await preparerEmpreintes(supabase).catch((e) => console.error("Empreintes :", (e as Error).message));
    await prechaufferClassements(supabase);
  });
  if (tache === "relance" && r.ok && Number(r.rapport.envoyes ?? 0) > 0) after(poursuivreEnvoi);
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
