"use server";

import { exigerUtilisateur } from "@/lib/acces";
import { genererCVUnitech, genererPDFUnitech, type ResultatCVUnitech, type ResultatPDFUnitech } from "./service";

export interface EtatCVUnitech { erreur?: string; resultat?: ResultatCVUnitech }
export interface EtatPDFUnitech { erreur?: string; resultat?: ResultatPDFUnitech }

/** Génère le Word Unitech d'un consultant (avec l'adéquation à une mission si elle est choisie), dans le dossier métier. */
export async function genererCVUnitechAction(_e: EtatCVUnitech, formData: FormData): Promise<EtatCVUnitech> {
  const { utilisateur, supabase } = await exigerUtilisateur();
  const consultantId = String(formData.get("consultant_id"));
  const missionId = String(formData.get("mission_id") ?? "") || null;
  try {
    const resultat = await genererCVUnitech(supabase, consultantId, { missionId, par: utilisateur.id });
    await supabase.from("journal_acces").insert({ utilisateur_id: utilisateur.id, action: "export", consultant_id: consultantId, details: { cv_unitech: resultat.word.nom, mission_id: missionId } });
    const { revalidatePath } = await import("next/cache");
    revalidatePath(`/consultants/${consultantId}`);
    if (missionId) revalidatePath(`/missions/${missionId}`);
    return { resultat };
  } catch (e) {
    return { erreur: (e as Error).message.slice(0, 300) };
  }
}

/** Interrupteur (administrateurs) : CV Unitech déposés dans les dossiers métier, ou dans le dossier d'essais. */
export async function changerDepotCVUnitech(formData: FormData) {
  const { exigerAdmin } = await import("@/lib/acces-admin");
  const { utilisateur, supabase } = await exigerAdmin();
  const actif = formData.get("actif") === "1";
  await supabase.from("reglages").upsert({ cle: "cv_unitech_depot_metier", valeur: actif });
  await supabase.from("journal_acces").insert({ utilisateur_id: utilisateur.id, action: "modification", consultant_id: null, details: { reglage: "cv_unitech_depot_metier", valeur: actif } });
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/parametres/analyse-cv");
}

/** PDF Unitech à partir du Word tel qu'il est dans SharePoint (après relecture et corrections de l'équipe). */
export async function genererPDFUnitechAction(_e: EtatPDFUnitech, formData: FormData): Promise<EtatPDFUnitech> {
  const { utilisateur, supabase } = await exigerUtilisateur();
  const id = String(formData.get("generation_id"));
  try {
    const resultat = await genererPDFUnitech(supabase, id);
    const { data: g } = await supabase.from("cv_unitech_generes").select("consultant_id, mission_id").eq("id", id).single();
    await supabase.from("journal_acces").insert({ utilisateur_id: utilisateur.id, action: "export", consultant_id: g?.consultant_id ?? null, details: { cv_unitech_pdf: resultat.pdf.nom } });
    const { revalidatePath } = await import("next/cache");
    if (g?.consultant_id) revalidatePath(`/consultants/${g.consultant_id}`);
    if (g?.mission_id) revalidatePath(`/missions/${g.mission_id}`);
    return { resultat };
  } catch (e) {
    return { erreur: (e as Error).message.slice(0, 300) };
  }
}
