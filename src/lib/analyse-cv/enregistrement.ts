import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PROMPT_VERSION, type ProfilCV } from "@/lib/ai";
import { signalerMissionsCorrespondantes } from "@/lib/matching/nouvelle-fiche";

/**
 * Enregistre la fiche de compétences d'un consultant (profil + compétences rattachées au référentiel).
 * `correspondance` : nom de compétence extrait → identifiant du référentiel (voir resoudreCompetences).
 * Le profil est ensuite comparé aux missions ouvertes (signalement au-dessus du seuil).
 */
export async function enregistrerProfil(
  supabase: SupabaseClient,
  consultantId: string,
  documentId: string,
  p: ProfilCV,
  modele: string,
  correspondance: Map<string, string[]>,
): Promise<boolean> {
  const { error } = await supabase.from("profils").upsert({
    consultant_id: consultantId, document_id: documentId, annees_experience: p.annees_experience, seniorite: p.seniorite,
    secteurs: p.secteurs, langues: p.langues, certifications: p.certifications, resume: p.resume,
    modele, prompt_version: PROMPT_VERSION,
  }, { onConflict: "consultant_id" });
  if (error) return false;
  const lignes = new Map<string, { niveau: number | null; annees: number | null }>();
  for (const c of p.competences) {
    for (const id of correspondance.get(c.nom) ?? []) if (!lignes.has(id)) lignes.set(id, { niveau: c.niveau, annees: c.annees });
  }
  await supabase.from("consultant_competences").delete().eq("consultant_id", consultantId);
  if (lignes.size) {
    await supabase.from("consultant_competences").insert([...lignes].map(([competence_id, v]) => ({ consultant_id: consultantId, competence_id, ...v })));
  }
  await signalerMissionsCorrespondantes(supabase, consultantId);
  return true;
}
