import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { graphTeleverser, trouverBibliotheque } from "@/lib/sharepoint";

/**
 * CV reçu par email : le fichier d'origine est déposé dans SharePoint (dossier « Candidatures reçues », un sous-dossier par mois),
 * hors du dossier des CV Unitech pour ne pas être pris pour un CV Unitech par la synchronisation. La fiche pointe ensuite vers ce fichier.
 */
export const DOSSIER_CANDIDATURES = "General/0 - Recrutement/Candidatures reçues";

const TYPES: Record<string, string> = {
  pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", doc: "application/msword",
};

export async function deposerCVRecu(supabase: SupabaseClient, documentId: string, contenu: Buffer, nomFichier: string, personne: { prenom: string; nom: string }, recuLe: string) {
  const ext = nomFichier.toLowerCase().split(".").pop() ?? "pdf";
  const propre = (t: string) => t.replace(/[\\/:*?"<>|#%]+/g, " ").replace(/\s+/g, " ").trim();
  const mois = recuLe.slice(0, 7);
  const nom = `CV reçu - ${propre(`${personne.prenom === "—" ? "" : personne.prenom} ${personne.nom}`)} - ${recuLe.slice(0, 10)}.${ext}`;
  const f = await graphTeleverser(await trouverBibliotheque(), `${DOSSIER_CANDIDATURES}/${mois}/${nom}`, contenu, TYPES[ext] ?? "application/octet-stream", fetch, "rename");
  await supabase.from("documents").update({ url_web: f.webUrl }).eq("id", documentId);
  return f;
}
