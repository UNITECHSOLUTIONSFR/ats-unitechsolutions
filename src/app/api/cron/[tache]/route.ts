import { after, NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { calculerApercus, recalculerEnAttente } from "@/lib/matching/stockage";
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
    // Une fois par heure seulement (chaque modification la met déjà à jour) : elle relit tout le tableau.
    // Contrôle complet de la liste des consultants une fois par nuit (vers 3 h, heure de Paris) : chaque modification la
    // met déjà à jour ; l'ancien contrôle horaire relisait toute la base pour rien (audit du 23/11/2026, point 2).
    const heureParis = Number(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false }).format(new Date()));
    const projection = heureParis === 3 && new Date().getMinutes() < 10 ? await actualiserProjection().catch((e) => ({ erreur: (e as Error).message })) : "contrôle de nuit seulement";
    // Emails relevés aussi d'ici, une fois par heure (passage de :20 à :29) : l'appel horaire direct de la tâche emails
    // par la base échoue (erreur réseau « HTTP2 framing ») et GitHub ne lance ses tâches horaires que quelques fois par jour.
    // Sans double passage : une relève faite il y a moins de 30 minutes n'est pas refaite.
    const minute = new Date().getMinutes();
    if (minute >= 20 && minute < 30) after(() => executerTache("emails", clientSupabaseAdmin(), { planifiee: true }).then(() => undefined).catch((e) => console.error("Emails :", (e as Error).message)));
    // Matching v3 : découpage des CV en expériences (lot de nuit, seulement s'il y a des CV nouveaux) et empreintes.
    const { avancerDecoupage, empreintesV3 } = await import("@/lib/matching/v3");
    const decoupage = await avancerDecoupage(clientSupabaseAdmin()).catch((e) => ({ etat: `erreur : ${(e as Error).message.slice(0, 200)}` }));
    const empreintesExp = await empreintesV3(clientSupabaseAdmin(), 70_000).catch((e) => ({ erreur: (e as Error).message.slice(0, 200) }));
    const { avancerReference, avancerTestDossiers, avancerTestV3b } = await import("@/lib/matching/v3-reference");
    const reference = await avancerReference(clientSupabaseAdmin()).catch((e) => `erreur : ${(e as Error).message.slice(0, 200)}`);
    const testDossiers = await avancerTestDossiers(clientSupabaseAdmin()).catch((e) => `erreur : ${(e as Error).message.slice(0, 200)}`);
    const testV3b = await avancerTestV3b(clientSupabaseAdmin()).catch((e) => `erreur : ${(e as Error).message.slice(0, 200)}`);
    const classements = await recalculerEnAttente(clientSupabaseAdmin(), 120_000);
    // Matching v2 pas encore activé : son aperçu est calculé à côté avec le temps qui reste (sans changer les écrans).
    const apercus = classements.restants === 0 ? await calculerApercus(clientSupabaseAdmin(), 80_000).catch((e) => ({ erreur: (e as Error).message })) : "plus tard";
    return NextResponse.json({ classements, projection, apercus, decoupage, empreintesExp, reference, testDossiers, testV3b });
  }
  // Candidats Collective : CV passés par le circuit normal (file d'attente imports_collective).
  if (tache === "collective") {
    const { traiterImportsCollective } = await import("@/lib/collective/import");
    return NextResponse.json(await traiterImportsCollective(clientSupabaseAdmin()));
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
