"use server";

import { exigerUtilisateur } from "@/lib/acces";
import { genererCVUnitech, type ResultatCVUnitech } from "./service";

export interface EtatCVUnitech { erreur?: string; resultat?: ResultatCVUnitech }

/**
 * Génère le Word Unitech et le PDF anonymisé d'un consultant (avec l'adéquation à une mission si elle est choisie).
 * Tant que le rendu n'est pas validé (réglage « cv_unitech_depot_metier »), les fichiers vont dans le dossier d'essais.
 */
export async function genererCVUnitechAction(_e: EtatCVUnitech, formData: FormData): Promise<EtatCVUnitech> {
  const { utilisateur, supabase } = await exigerUtilisateur();
  const consultantId = String(formData.get("consultant_id"));
  const missionId = String(formData.get("mission_id") ?? "") || null;
  const { data: reglage } = await supabase.from("reglages").select("valeur").eq("cle", "cv_unitech_depot_metier").maybeSingle();
  try {
    const resultat = await genererCVUnitech(supabase, consultantId, { missionId, essai: reglage?.valeur !== true && reglage?.valeur !== "true" });
    await supabase.from("journal_acces").insert({ utilisateur_id: utilisateur.id, action: "export", consultant_id: consultantId, details: { cv_unitech: resultat.word.nom, mission_id: missionId } });
    return { resultat };
  } catch (e) {
    return { erreur: (e as Error).message.slice(0, 300) };
  }
}
