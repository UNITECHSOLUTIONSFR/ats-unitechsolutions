import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { collecterAnalyse, envoyerAnalyse } from "@/lib/analyse-cv/coeur";
import { traiterEmails } from "@/lib/emails/traitement";
import { envoiActif } from "@/lib/relance/modele";
import { envoyerLot } from "@/lib/relance/envoi";
import { synchroniserCV } from "./cv";
import { reprendreIllisibles } from "@/lib/analyse-cv/illisibles";
import { actualiserPDFUnitech, deposerCVEmails } from "@/lib/cv-unitech/service";
import { sauvegarderDansSharePoint } from "./sauvegarde";
import { synchroniserExcel } from "./excel";

export const TACHES = {
  excel: { type: "synchro_excel", libelle: "Fichier Excel de suivi" },
  cv: { type: "synchro_cv", libelle: "CV SharePoint (association, fiches, analyse)" },
  emails: { type: "synchro_emails", libelle: "Candidatures email" },
  sauvegarde: { type: "sauvegarde_hebdo", libelle: "Sauvegarde Excel dans SharePoint (chaque semaine)" },
  relance: { type: "relance_disponibilite", libelle: "Relance des disponibilités (envoi du lot suivant)" },
} as const;
export type NomTache = keyof typeof TACHES;

/**
 * Deux planificateurs (GitHub et, en secours, Supabase) appellent les mêmes tâches : une tâche planifiée déjà faite
 * récemment, ou en cours, n'est pas relancée. Délai en minutes. Les lancements depuis l'application ne sont pas concernés.
 */
const DEJA_FAITE_MINUTES: Partial<Record<NomTache, number>> = { excel: 360, cv: 360, emails: 30, sauvegarde: 3 * 24 * 60 };

export async function tacheDejaFaite(nom: NomTache, supabase: SupabaseClient, maintenant = Date.now()): Promise<string | null> {
  const delai = DEJA_FAITE_MINUTES[nom];
  if (!delai) return null;
  const { data } = await supabase.from("executions").select("debut, statut").eq("type", TACHES[nom].type)
    .gte("debut", new Date(maintenant - Math.max(delai, 15) * 60_000).toISOString()).order("debut", { ascending: false }).limit(5);
  for (const e of data ?? []) {
    if (e.statut === "termine") return `déjà faite à ${new Date(e.debut).toISOString()}`;
    if (e.statut === "en_cours" && maintenant - Date.parse(e.debut) < 15 * 60_000) return "déjà en cours";
  }
  return null;
}

/** Exécute une tâche planifiée et la trace dans le journal des traitements (rapport du matin). */
export async function executerTache(nom: NomTache, supabase: SupabaseClient, options: { planifiee?: boolean } = {}): Promise<{ ok: boolean; rapport: Record<string, unknown> }> {
  if (options.planifiee) {
    const deja = await tacheDejaFaite(nom, supabase);
    if (deja) {
      // Lecture des CV déjà faite : on récupère quand même les résultats d'une analyse IA terminée (sans rien relancer).
      if (nom === "cv") {
        const r = await collecterAnalyse(supabase).catch((e) => ({ erreur: (e as Error).message, message: undefined }));
        return { ok: true, rapport: { ignoree: deja, resultatsAnalyse: r.message ?? r.erreur } };
      }
      return { ok: true, rapport: { ignoree: deja } };
    }
  }
  const { data: execution } = await supabase.from("executions").insert({ type: TACHES[nom].type }).select("id").single();
  let rapport: Record<string, unknown> = {};
  let ok = true;
  try {
    if (nom === "excel") rapport = { ...(await synchroniserExcel(supabase)) };
    if (nom === "cv") {
      // Résultats de l'analyse lancée la veille, puis nouveaux fichiers, puis nouvelle analyse (lot à 50 %).
      const resultats = await collecterAnalyse(supabase);
      const synchro = await synchroniserCV(supabase);
      // CV illisibles (vieux .doc, scans) : une dizaine repris par nuit, avant l'envoi de l'analyse.
      const illisibles = await reprendreIllisibles(supabase).catch((e) => ({ erreur: (e as Error).message }));
      const envoi = await envoyerAnalyse(supabase);
      // CV reçus par email : Word et PDF Unitech déposés dans SharePoint (une fois le rendu validé).
      const cvUnitech = await deposerCVEmails(supabase).catch((e) => ({ erreur: (e as Error).message }));
      // Word Unitech corrigés dans SharePoint depuis leur dernier PDF : PDF mis à jour.
      const pdfUnitech = await actualiserPDFUnitech(supabase).catch((e) => ({ erreur: (e as Error).message }));
      rapport = { synchro, illisibles, cvUnitech, pdfUnitech, resultatsAnalyse: resultats.message ?? resultats.erreur, envoiAnalyse: envoi.message ?? envoi.erreur };
    }
    if (nom === "emails") rapport = { ...(await traiterEmails(supabase)) };
    if (nom === "sauvegarde") rapport = { ...(await sauvegarderDansSharePoint(supabase)) };
    if (nom === "relance") {
      if (!envoiActif()) throw new Error("envoi des emails non branché (Exchange)");
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
