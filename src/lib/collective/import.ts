import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { traiterCV } from "@/lib/consultants/cv-arriere-plan";
import { ESPACE_ADEQUATIONS } from "@/lib/cv-unitech/service";
import { cheminCVCollective } from "./fichier";

/** Compte de l'administratrice qui a demandé l'import (historique des fiches). */
const ACTEUR = "db7f1a37-f71c-4aa2-98f8-30cd67874ca4";

/**
 * Candidats Collective (24/11/2026) : chaque CV passe par le circuit normal d'un CV ajouté à la main — fichier lu une fois,
 * parcours rempli par l'IA (compétences, expériences), champs vides complétés. Le PDF est rangé dans l'espace privé de
 * l'outil et s'ouvre depuis la fiche (/api/documents/[id]/fichier) ; pas de dépôt dans SharePoint (décision du 24/11/2026).
 * L'ancienne copie « texte seul » est retirée de la fiche (marquée supprimée, rien n'est effacé).
 */
/** Range le PDF dans l'outil et fait pointer le document de la fiche vers lui. */
async function rangerFichier(supabase: SupabaseClient, applicationId: string, contenu: Buffer, type: string): Promise<void> {
  const identifiant = `collective-cv:${applicationId}`;
  const chemin = cheminCVCollective(identifiant)!;
  const { error } = await supabase.storage.from(ESPACE_ADEQUATIONS).upload(chemin, contenu, { contentType: type, upsert: true });
  if (error) throw new Error(`rangement du CV impossible : ${error.message}`);
  const { data: doc } = await supabase.from("documents").select("id").eq("sharepoint_item_id", identifiant).maybeSingle();
  if (doc) await supabase.from("documents").update({ url_web: `/api/documents/${doc.id}/fichier` }).eq("id", doc.id);
}

async function telecharger(lien: string): Promise<{ contenu: Buffer; type: string }> {
  const r = await fetch(lien);
  if (!r.ok) throw new Error(`téléchargement refusé (${r.status})`);
  return { contenu: Buffer.from(await r.arrayBuffer()), type: r.headers.get("content-type") ?? "application/pdf" };
}

export async function traiterImportsCollective(supabase: SupabaseClient, budgetMs = 200_000): Promise<{ faits: number; erreurs: number; restants: number; ranges: number }> {
  const debut = Date.now();
  // CV déjà passés avant le rangement dans l'outil (lien Collective sur la fiche) : fichier rangé, sans nouvelle lecture.
  let ranges = 0;
  const { data: anciens } = await supabase.from("documents").select("sharepoint_item_id, url_web").like("sharepoint_item_id", "collective-cv:%").like("url_web", "https://%").limit(20);
  for (const a of anciens ?? []) {
    try {
      const f = await telecharger(a.url_web as string);
      await rangerFichier(supabase, String(a.sharepoint_item_id).replace("collective-cv:", ""), f.contenu, f.type);
      ranges++;
    } catch (e) { console.error("CV Collective :", (e as Error).message); }
  }
  const { data: file } = await supabase.from("imports_collective").select("application_id, consultant_id, cv_lien, nom_fichier").eq("statut", "a_traiter").order("created_at").limit(40);
  let faits = 0, erreurs = 0;
  for (const it of file ?? []) {
    if (Date.now() - debut > budgetMs) break;
    try {
      const { contenu, type } = await telecharger(it.cv_lien);
      const nom = /\.(pdf|docx?|DOCX?|PDF)$/.test(it.nom_fichier) ? it.nom_fichier : `${it.nom_fichier}.pdf`;
      const message = await traiterCV(it.consultant_id, new File([new Uint8Array(contenu)], nom, { type }), ACTEUR,
        { deposer: false, urlWeb: it.cv_lien, origine: "collective", identifiant: `collective-cv:${it.application_id}` });
      await rangerFichier(supabase, it.application_id, contenu, type);
      await supabase.from("documents").update({ supprime_sharepoint: true }).eq("sharepoint_item_id", `collective:${it.application_id}`);
      await supabase.from("imports_collective").update({ statut: "fait", message, traite_le: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("application_id", it.application_id);
      faits++;
    } catch (e) {
      erreurs++;
      await supabase.from("imports_collective").update({ statut: "erreur", message: (e as Error).message.slice(0, 300), traite_le: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("application_id", it.application_id);
    }
  }
  const { count } = await supabase.from("imports_collective").select("application_id", { count: "exact", head: true }).eq("statut", "a_traiter");
  return { faits, erreurs, restants: count ?? 0, ranges };
}
