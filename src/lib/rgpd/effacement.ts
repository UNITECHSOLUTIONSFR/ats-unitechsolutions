import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface FichierAEffacer { nom: string; chemin: string | null; url: string | null }

/**
 * Droit à l'effacement : supprime de la base toutes les données d'une personne
 * (fiche, profil, compétences, propositions, historique, lignes du tableau, emails reçus, documents et leur texte).
 * Renvoie la liste des fichiers SharePoint à supprimer à la main (l'outil n'écrit pas dans SharePoint).
 * La suppression reste tracée dans le journal d'accès (déclencheur en base).
 */
export async function effacerPersonne(supabase: SupabaseClient, consultantId: string): Promise<FichierAEffacer[]> {
  const { data: docs } = await supabase.from("documents").select("id, nom_fichier, chemin, url_web, sharepoint_drive_id").eq("consultant_id", consultantId);
  const fichiers = (docs ?? []).map((d) => ({
    nom: d.nom_fichier,
    chemin: String(d.sharepoint_drive_id).startsWith("boite:") ? "Boîte ATS Candidatures (email)" : d.chemin,
    url: d.url_web,
  }));
  await supabase.from("documents").delete().eq("consultant_id", consultantId);
  await supabase.from("emails_entrants").delete().eq("consultant_id", consultantId);
  const { error } = await supabase.from("consultants").delete().eq("id", consultantId); // cascade : profil, compétences, propositions, historique, tableau
  if (error) throw new Error(error.message);
  return fichiers;
}

/** Toutes les données d'une personne, pour le droit d'accès (export). */
export async function donneesPersonne(supabase: SupabaseClient, consultantId: string) {
  const une = async (table: string, colonne = "consultant_id") => (await supabase.from(table).select("*").eq(colonne, consultantId)).data ?? [];
  const [fiche] = await une("consultants", "id");
  const docs = (await une("documents")).map(({ texte_extrait, ...d }) => ({ ...d, texte_extrait_longueur: String(texte_extrait ?? "").length }));
  return {
    exporte_le: new Date().toISOString(),
    fiche, profil: await une("profils"), competences: await une("consultant_competences"), documents: docs,
    propositions: await une("propositions"), historique: await une("consultants_historique"),
    emails_recus: await une("emails_entrants"), alertes: await une("alertes"), tableau_de_suivi: await une("tableau_lignes"),
  };
}
