import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { collecterAnalyse, envoyerAnalyse } from "@/lib/analyse-cv/coeur";
import { traiterEmails } from "@/lib/emails/traitement";
import { relanceActive } from "@/lib/relance/modele";
import { envoyerLot } from "@/lib/relance/envoi";
import { synchroniserCV } from "./cv";
import { synchroniserExcel } from "./excel";

export const TACHES = {
  excel: { type: "synchro_excel", libelle: "Fichier Excel de suivi" },
  cv: { type: "synchro_cv", libelle: "CV SharePoint (association, fiches, analyse)" },
  emails: { type: "synchro_emails", libelle: "Candidatures email" },
  relance: { type: "relance_disponibilite", libelle: "Relance des disponibilités (envoi du lot suivant)" },
} as const;
export type NomTache = keyof typeof TACHES;

/** Exécute une tâche planifiée et la trace dans le journal des traitements (rapport du matin). */
export async function executerTache(nom: NomTache, supabase: SupabaseClient): Promise<{ ok: boolean; rapport: Record<string, unknown> }> {
  const { data: execution } = await supabase.from("executions").insert({ type: TACHES[nom].type }).select("id").single();
  let rapport: Record<string, unknown> = {};
  let ok = true;
  try {
    if (nom === "excel") rapport = { ...(await synchroniserExcel(supabase)) };
    if (nom === "cv") {
      // Résultats de l'analyse lancée la veille, puis nouveaux fichiers, puis nouvelle analyse (lot à 50 %).
      const resultats = await collecterAnalyse(supabase);
      const synchro = await synchroniserCV(supabase);
      const envoi = await envoyerAnalyse(supabase);
      rapport = { synchro, resultatsAnalyse: resultats.message ?? resultats.erreur, envoiAnalyse: envoi.message ?? envoi.erreur };
    }
    if (nom === "emails") rapport = { ...(await traiterEmails(supabase)) };
    if (nom === "relance") {
      if (!relanceActive()) throw new Error("relance des disponibilités désactivée");
      // Un appel = jusqu'à 4 lots espacés d'une minute (rythme toléré par Exchange), dans la limite des 5 minutes.
      const total = { envoyes: 0, erreurs: 0, termines: 0 };
      const debut = Date.now();
      for (let lot = 0; lot < 4 && Date.now() - debut < 200_000; lot++) {
        const b = await envoyerLot(supabase, process.env.URL_SITE ?? "https://ats-unitechsolutions.vercel.app");
        total.envoyes += b.envoyes; total.erreurs += b.erreurs; total.termines += b.termines;
        if (!b.envoyes) break;
        if (lot < 3) await new Promise((ok) => setTimeout(ok, 60_000));
      }
      rapport = { ...total };
    }
  } catch (e) {
    ok = false;
    rapport = { erreur: (e as Error).message };
  }
  if (execution) {
    await supabase.from("executions").update({
      fin: new Date().toISOString(), statut: ok ? "termine" : "echec", erreurs: ok ? 0 : 1, rapport,
    }).eq("id", execution.id);
  }
  return { ok, rapport };
}
