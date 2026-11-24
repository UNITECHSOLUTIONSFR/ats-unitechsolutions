import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { traiterCV } from "@/lib/consultants/cv-arriere-plan";

/** Compte de l'administratrice qui a demandé l'import (historique des fiches). */
const ACTEUR = "db7f1a37-f71c-4aa2-98f8-30cd67874ca4";

/**
 * Candidats Collective (24/11/2026) : chaque CV passe par le circuit normal d'un CV ajouté à la main — fichier lu une fois,
 * parcours rempli par l'IA (compétences, expériences), champs vides complétés. Le lien du PDF chez Collective reste sur la
 * fiche ; pas de dépôt dans SharePoint tant que l'utilisatrice ne l'a pas validé. L'ancienne copie « texte seul » est
 * retirée de la fiche (marquée supprimée, rien n'est effacé).
 */
export async function traiterImportsCollective(supabase: SupabaseClient, budgetMs = 200_000): Promise<{ faits: number; erreurs: number; restants: number }> {
  const debut = Date.now();
  const { data: file } = await supabase.from("imports_collective").select("application_id, consultant_id, cv_lien, nom_fichier").eq("statut", "a_traiter").order("created_at").limit(40);
  let faits = 0, erreurs = 0;
  for (const it of file ?? []) {
    if (Date.now() - debut > budgetMs) break;
    try {
      const r = await fetch(it.cv_lien);
      if (!r.ok) throw new Error(`téléchargement refusé (${r.status})`);
      const contenu = Buffer.from(await r.arrayBuffer());
      const nom = /\.(pdf|docx?|DOCX?|PDF)$/.test(it.nom_fichier) ? it.nom_fichier : `${it.nom_fichier}.pdf`;
      const message = await traiterCV(it.consultant_id, new File([contenu], nom, { type: r.headers.get("content-type") ?? "application/pdf" }), ACTEUR,
        { deposer: false, urlWeb: it.cv_lien, origine: "collective", identifiant: `collective-cv:${it.application_id}` });
      await supabase.from("documents").update({ supprime_sharepoint: true }).eq("sharepoint_item_id", `collective:${it.application_id}`);
      await supabase.from("imports_collective").update({ statut: "fait", message, traite_le: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("application_id", it.application_id);
      faits++;
    } catch (e) {
      erreurs++;
      await supabase.from("imports_collective").update({ statut: "erreur", message: (e as Error).message.slice(0, 300), traite_le: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("application_id", it.application_id);
    }
  }
  const { count } = await supabase.from("imports_collective").select("application_id", { count: "exact", head: true }).eq("statut", "a_traiter");
  return { faits, erreurs, restants: count ?? 0 };
}
