"use server";

import { exigerUtilisateur } from "@/lib/acces";
import { genererCVUnitech, genererPDFUnitech, remplacerWordUnitech, type ResultatCVUnitech, type ResultatPDFUnitech } from "./service";

export interface EtatCVUnitech { erreur?: string; resultat?: ResultatCVUnitech; lance?: boolean }
export interface EtatPDFUnitech { erreur?: string; resultat?: ResultatPDFUnitech }

/** Génère le Word Unitech d'un consultant (avec l'adéquation à une mission si elle est choisie), dans le dossier métier. */
export async function genererCVUnitechAction(_e: EtatCVUnitech, formData: FormData): Promise<EtatCVUnitech> {
  const { utilisateur, supabase } = await exigerUtilisateur();
  const consultantId = String(formData.get("consultant_id"));
  const missionId = String(formData.get("mission_id") ?? "") || null;
  if (formData.get("arriere_plan") !== "1") {
    // Depuis une mission : le résultat est attendu sur place (lien du Word affiché dans la ligne du profil).
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
  // Depuis la fiche : préparé en arrière-plan (≈ 20 à 30 s) ; la fiche affiche « en préparation » puis le Word apparaît tout seul.
  const { clientSupabaseAdmin } = await import("@/lib/supabase/admin");
  const admin = clientSupabaseAdmin();
  await admin.from("consultants").update({ cv_unitech_en_cours: new Date().toISOString(), cv_unitech_message: null }).eq("id", consultantId);
  const travail = async () => {
    try {
      const resultat = await genererCVUnitech(admin, consultantId, { missionId, par: utilisateur.id });
      await admin.from("journal_acces").insert({ utilisateur_id: utilisateur.id, action: "export", consultant_id: consultantId, details: { cv_unitech: resultat.word.nom, mission_id: missionId } });
      await admin.from("consultants").update({ cv_unitech_en_cours: null, cv_unitech_message: resultat.avertissement ?? null }).eq("id", consultantId);
    } catch (e) {
      await admin.from("consultants").update({ cv_unitech_en_cours: null, cv_unitech_message: `Échec : ${(e as Error).message.slice(0, 250)}` }).eq("id", consultantId);
    }
  };
  const { after } = await import("next/server");
  try { after(travail); } catch { await travail(); }
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/consultants/${consultantId}`);
  return { lance: true };
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

export interface EtatRemplacementWord { erreur?: string; resultat?: ResultatPDFUnitech & { word: { nom: string; url: string } } }

/** Remplace le Word Unitech par un fichier choisi (Word corrigé à la main), puis refait le PDF. */
export async function remplacerWordUnitechAction(_e: EtatRemplacementWord, formData: FormData): Promise<EtatRemplacementWord> {
  const { utilisateur, supabase } = await exigerUtilisateur();
  const id = String(formData.get("generation_id"));
  const fichier = formData.get("word");
  if (!(fichier instanceof File) || fichier.size === 0) return { erreur: "Choisissez le Word Unitech (.docx)." };
  if (!/\.docx$/i.test(fichier.name)) return { erreur: "Le fichier doit être un Word (.docx)." };
  if (fichier.size > 4 * 1024 * 1024) return { erreur: "Fichier trop lourd (4 Mo maximum)." };
  const contenu = Buffer.from(await fichier.arrayBuffer());
  // Un .docx est une archive zip : refus d'un fichier qui n'en est pas un.
  if (contenu[0] !== 0x50 || contenu[1] !== 0x4b) return { erreur: "Ce fichier n'est pas un Word valide." };
  try {
    const resultat = await remplacerWordUnitech(supabase, id, contenu);
    const { data: g } = await supabase.from("cv_unitech_generes").select("consultant_id, mission_id").eq("id", id).single();
    await supabase.from("journal_acces").insert({ utilisateur_id: utilisateur.id, action: "modification", consultant_id: g?.consultant_id ?? null, details: { cv_unitech_word_remplace: resultat.word.nom } });
    const { revalidatePath } = await import("next/cache");
    if (g?.consultant_id) revalidatePath(`/consultants/${g.consultant_id}`);
    if (g?.mission_id) revalidatePath(`/missions/${g.mission_id}`);
    return { resultat };
  } catch (e) {
    return { erreur: (e as Error).message.slice(0, 300) };
  }
}
