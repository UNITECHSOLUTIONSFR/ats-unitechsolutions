"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { exigerUtilisateur } from "@/lib/acces";
import { exigerAdmin } from "@/lib/acces-admin";
import { extraireExigencesMission, ErreurIA, type UsageIA } from "@/lib/ai";
import { enregistrerUsages } from "@/lib/ai/journal";
import { resoudreCompetences } from "@/lib/matching/competences";

export interface EtatFormulaireMission {
  erreur?: string;
}

const STATUTS_PROPOSITION = ["propose", "appele", "envoye_client", "retenu", "refuse"] as const;
const STATUTS_MISSION = ["ouverte", "pourvue", "fermee"] as const;

/** Enregistre un besoin client collé dans l'application, en extrait les exigences, puis ouvre le classement. */
export async function creerMission(_etat: EtatFormulaireMission, formData: FormData): Promise<EtatFormulaireMission> {
  const { utilisateur, supabase } = await exigerUtilisateur();
  const texte = String(formData.get("texte_besoin") ?? "").trim();
  const client = String(formData.get("client") ?? "").trim() || null;
  if (texte.length < 30) return { erreur: "Collez le texte complet du besoin (30 caractères au minimum)." };

  let usages: UsageIA[] = [];
  let missionId: string;
  try {
    const r = await extraireExigencesMission(texte);
    usages = r.usages;
    const ex = r.donnees;
    const correspondance = await resoudreCompetences(supabase, ex.competences.map((c) => c.nom));

    const { data: mission, error } = await supabase
      .from("missions")
      .insert({
        client: client ?? ex.client,
        intitule: ex.intitule,
        texte_besoin: texte,
        exigences: ex,
        localisation: ex.localisation,
        date_debut: /^\d{4}-\d{2}-\d{2}$/.test(ex.date_debut ?? "") ? ex.date_debut : null,
        annees_min: ex.annees_min,
        seniorite: ex.seniorite,
        modele: r.modele,
        prompt_version: r.promptVersion,
        cree_par: utilisateur.id,
      })
      .select("id")
      .single();
    if (error || !mission) throw new Error(error?.message ?? "Mission non enregistrée");
    missionId = mission.id;

    const lignes = new Map<string, { obligatoire: boolean; importance: number; annees_min: number | null }>();
    for (const c of ex.competences) {
      const id = correspondance.get(c.nom);
      if (!id) continue;
      const deja = lignes.get(id);
      lignes.set(id, {
        obligatoire: c.obligatoire || !!deja?.obligatoire,
        importance: Math.max(c.importance, deja?.importance ?? 1),
        annees_min: c.annees_min ?? deja?.annees_min ?? null,
      });
    }
    if (lignes.size) {
      await supabase.from("mission_competences").insert(
        [...lignes].map(([competence_id, v]) => ({ mission_id: missionId, competence_id, ...v })),
      );
    }
  } catch (e) {
    const u = (e as { usages?: UsageIA[] }).usages;
    if (u) usages = u;
    await enregistrerUsages(usages).catch(() => {});
    return {
      erreur:
        e instanceof ErreurIA
          ? `L'analyse automatique a échoué : ${e.message}`
          : "La mission n'a pas pu être enregistrée. Réessayez dans un instant.",
    };
  }
  await enregistrerUsages(usages, `mission:${missionId}`).catch(() => {});
  redirect(`/missions/${missionId}`);
}

/** Modifie une exigence (obligatoire ou non, importance) puis recalcule le classement. */
export async function modifierExigence(formData: FormData) {
  const { supabase } = await exigerUtilisateur();
  const missionId = String(formData.get("mission_id"));
  const competenceId = String(formData.get("competence_id"));
  const action = String(formData.get("action"));
  if (action === "retirer") {
    await supabase.from("mission_competences").delete().match({ mission_id: missionId, competence_id: competenceId });
  } else if (action === "obligatoire") {
    await supabase.from("mission_competences").update({ obligatoire: formData.get("valeur") === "true" })
      .match({ mission_id: missionId, competence_id: competenceId });
  } else if (action === "importance") {
    const importance = Math.min(3, Math.max(1, Number(formData.get("valeur"))));
    await supabase.from("mission_competences").update({ importance }).match({ mission_id: missionId, competence_id: competenceId });
  }
  revalidatePath(`/missions/${missionId}`);
}

export async function changerStatutMission(formData: FormData) {
  const { supabase } = await exigerUtilisateur();
  const missionId = String(formData.get("mission_id"));
  const statut = String(formData.get("statut"));
  if (!STATUTS_MISSION.includes(statut as (typeof STATUTS_MISSION)[number])) return;
  await supabase.from("missions").update({ statut }).eq("id", missionId);
  revalidatePath(`/missions/${missionId}`);
  revalidatePath("/missions");
}

/** Ajoute un consultant au suivi de la mission, ou change le statut de sa proposition. */
export async function suivreProposition(formData: FormData) {
  const { utilisateur, supabase } = await exigerUtilisateur();
  const missionId = String(formData.get("mission_id"));
  const consultantId = String(formData.get("consultant_id"));
  const statut = String(formData.get("statut") ?? "propose");
  if (!STATUTS_PROPOSITION.includes(statut as (typeof STATUTS_PROPOSITION)[number])) return;
  const score = formData.get("score") ? Number(formData.get("score")) : null;
  const detail = formData.get("detail") ? JSON.parse(String(formData.get("detail"))) : undefined;

  const { data: existante } = await supabase
    .from("propositions").select("id").match({ mission_id: missionId, consultant_id: consultantId }).maybeSingle();
  if (existante) {
    await supabase.from("propositions").update({ statut }).eq("id", existante.id);
  } else {
    await supabase.from("propositions").insert({
      mission_id: missionId, consultant_id: consultantId, statut, score, detail_score: detail ?? {},
    });
  }
  await supabase.from("consultants").update({ dernier_contact_le: new Date().toISOString() }).eq("id", consultantId);
  await supabase.from("journal_acces").insert({
    utilisateur_id: utilisateur.id, action: "modification", consultant_id: consultantId,
    details: { proposition: { mission_id: missionId, statut } },
  });
  revalidatePath(`/missions/${missionId}`);
}

/** Assigne (ou réassigne) une mission à une personne invitée. Réservé aux administrateurs (également vérifié par la base). */
export async function assignerMission(formData: FormData) {
  const { utilisateur, supabase } = await exigerAdmin();
  const missionId = String(formData.get("mission_id"));
  const responsable = String(formData.get("responsable_id") ?? "") || null;
  const { error } = await supabase.from("missions").update({ responsable_id: responsable }).eq("id", missionId);
  if (error) throw new Error(error.message);
  await supabase.from("journal_acces").insert({
    utilisateur_id: utilisateur.id, action: "modification", consultant_id: null, details: { mission_assignee: { mission_id: missionId, responsable_id: responsable } },
  });
  revalidatePath(`/missions/${missionId}`);
  revalidatePath("/missions");
  revalidatePath("/");
}
