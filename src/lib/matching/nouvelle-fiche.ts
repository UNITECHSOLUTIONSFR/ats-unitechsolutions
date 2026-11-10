import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chargerMissionAScorer, ponderationsReglees } from "./classement";
import { scorerConsultant, type Seniorite } from "./score";

/**
 * Nouvelle fiche (ou fiche mise à jour) : score face à chaque mission ouverte. Au-dessus du seuil réglé,
 * le consultant est ajouté au suivi de la mission (statut « proposé ») : il apparaît dans le classement suivi.
 * Aucune IA : simple calcul sur la base.
 */
export async function signalerMissionsCorrespondantes(supabase: SupabaseClient, consultantId: string): Promise<number> {
  const [{ data: missions }, { data: reglage }, ponderations, { data: c }, { data: comp }] = await Promise.all([
    supabase.from("missions").select("id").eq("statut", "ouverte"),
    supabase.from("reglages").select("valeur").eq("cle", "seuil_alerte_nouvelle_fiche").maybeSingle(),
    ponderationsReglees(supabase),
    supabase.from("consultants").select("disponibilite, disponible_le, disponibilite_maj_le, localisation, statut, profils(annees_experience, seniorite)").eq("id", consultantId).maybeSingle(),
    supabase.from("consultant_competences").select("competence_id, annees").eq("consultant_id", consultantId),
  ]);
  if (!missions?.length || !c || c.statut === "inactif") return 0;
  const seuil = Number(reglage?.valeur ?? 70);
  const profil = (c.profils as unknown as { annees_experience: number | null; seniorite: Seniorite | null } | null) ?? null;
  let signales = 0;
  for (const m of missions) {
    const mission = await chargerMissionAScorer(supabase, m.id);
    if (!mission) continue;
    const r = scorerConsultant(mission, {
      competences: (comp ?? []).map((k) => ({ competence_id: k.competence_id, annees: k.annees === null ? null : Number(k.annees) })),
      annees_experience: profil?.annees_experience ?? null, seniorite: profil?.seniorite ?? null,
      disponible_le: c.disponible_le, disponibilite: c.disponibilite, disponibilite_maj_le: c.disponibilite_maj_le, localisation: c.localisation,
    }, ponderations);
    if (r.elimine || r.score < seuil) continue;
    const { error } = await supabase.from("propositions").insert({
      mission_id: m.id, consultant_id: consultantId, score: r.score, detail_score: r, statut: "propose",
      commentaire: "Ajouté automatiquement : nouveau profil au-dessus du seuil",
    });
    if (!error) signales++; // déjà suivi sur cette mission : rien à faire
  }
  return signales;
}
