"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { exigerUtilisateur } from "@/lib/acces";
import { exigerAdmin } from "@/lib/acces-admin";
import { extraireExigencesMission, ErreurIA, type UsageIA } from "@/lib/ai";
import { enregistrerUsages } from "@/lib/ai/journal";
import { resoudreCompetences } from "@/lib/matching/competences";
import { extraireTexte } from "@/lib/sharepoint/extraction";

export interface EtatFormulaireMission {
  erreur?: string;
}

const STATUTS_PROPOSITION = ["propose", "appele", "envoye_client", "retenu", "refuse"] as const;
const STATUTS_MISSION = ["ouverte", "pourvue", "fermee"] as const;

export interface BrouillonMission {
  texte: string;
  client: string | null;
  intitule: string;
  localisation: string | null;
  date_debut: string | null; // AAAA-MM-JJ
  annees_min: number | null;
  seniorite: "junior" | "confirme" | "senior" | "expert" | null;
  competences: { nom: string; obligatoire: boolean; importance: number; annees_min: number | null }[];
}
export interface EtatAnalyseMission { erreur?: string; brouillon?: BrouillonMission }

/**
 * Étape 1 : lit la fiche mission (PDF, Word, ou texte collé) et pré-remplit le formulaire grâce à l'IA (Haiku).
 * Rien n'est enregistré : la personne relit et corrige avant de créer la mission.
 */
export async function analyserBesoin(_e: EtatAnalyseMission, formData: FormData): Promise<EtatAnalyseMission> {
  await exigerUtilisateur();
  let texte = String(formData.get("texte_besoin") ?? "").trim();
  const fichier = formData.get("fichier");
  if (fichier instanceof File && fichier.size > 0) {
    if (fichier.size > 4 * 1024 * 1024) return { erreur: "Fichier trop lourd (4 Mo au maximum)." };
    if (!/\.(pdf|docx|doc|txt)$/i.test(fichier.name)) return { erreur: "Formats acceptés : PDF, Word ou texte." };
    const extrait = await extraireTexte(Buffer.from(await fichier.arrayBuffer()), fichier.name);
    if (!extrait.extractible) return { erreur: "Ce fichier ne contient pas de texte lisible (document scanné ?). Collez le texte à la place." };
    texte = [extrait.texte, texte].filter(Boolean).join("\n\n");
  }
  if (texte.length < 30) return { erreur: "Importez la fiche mission ou collez le texte complet du besoin." };
  let usages: UsageIA[] = [];
  try {
    const r = await extraireExigencesMission(texte);
    usages = r.usages;
    const ex = r.donnees;
    return {
      brouillon: {
        texte, client: ex.client, intitule: ex.intitule, localisation: ex.localisation,
        date_debut: /^\d{4}-\d{2}-\d{2}$/.test(ex.date_debut ?? "") ? ex.date_debut : null,
        annees_min: ex.annees_min, seniorite: ex.seniorite, competences: ex.competences,
      },
    };
  } catch (e) {
    usages = (e as { usages?: UsageIA[] }).usages ?? usages;
    return { erreur: e instanceof ErreurIA ? `Lecture automatique impossible : ${e.message}` : "La fiche n'a pas pu être lue. Réessayez dans un instant." };
  } finally {
    await enregistrerUsages(usages, "mission:analyse").catch(() => {});
  }
}

/** Étape 2 : crée la mission avec les valeurs relues (sans nouvel appel à l'IA), puis ouvre le classement. */
export async function creerMission(_e: EtatFormulaireMission, formData: FormData): Promise<EtatFormulaireMission> {
  const { utilisateur, supabase } = await exigerUtilisateur();
  let b: BrouillonMission;
  try { b = JSON.parse(String(formData.get("brouillon") ?? "")) as BrouillonMission; } catch { return { erreur: "Formulaire incomplet." }; }
  const texteChamp = (k: string) => String(formData.get(k) ?? "").trim() || null;
  const intitule = texteChamp("intitule");
  if (!intitule) return { erreur: "Le poste est obligatoire." };
  const annees = Number(formData.get("annees_min"));
  const seniorite = String(formData.get("seniorite") ?? "");
  const dateDebut = texteChamp("date_debut");
  const competences = b.competences.filter((c) => c.nom.trim());

  let missionId: string;
  try {
    const correspondance = await resoudreCompetences(supabase, competences.map((c) => c.nom));
    const { data: mission, error } = await supabase.from("missions").insert({
      client: texteChamp("client"), intitule, texte_besoin: b.texte,
      responsable_id: utilisateur.id, // la personne qui crée la mission en est responsable d'office (un admin peut réassigner)
      exigences: { ...b, competences },
      localisation: texteChamp("localisation"),
      date_debut: dateDebut && /^\d{4}-\d{2}-\d{2}$/.test(dateDebut) ? dateDebut : null,
      annees_min: Number.isFinite(annees) && annees > 0 ? annees : null,
      seniorite: ["junior", "confirme", "senior", "expert"].includes(seniorite) ? seniorite : null,
      cree_par: utilisateur.id,
    }).select("id").single();
    if (error || !mission) throw new Error(error?.message ?? "Mission non enregistrée");
    missionId = mission.id;

    const lignes = new Map<string, { obligatoire: boolean; importance: number; annees_min: number | null }>();
    for (const c of competences) for (const id of correspondance.get(c.nom) ?? []) {
      const deja = lignes.get(id);
      lignes.set(id, {
        obligatoire: c.obligatoire || !!deja?.obligatoire,
        importance: Math.min(3, Math.max(1, Math.max(c.importance, deja?.importance ?? 1))),
        annees_min: c.annees_min ?? deja?.annees_min ?? null,
      });
    }
    if (lignes.size) {
      await supabase.from("mission_competences").insert([...lignes].map(([competence_id, v]) => ({ mission_id: missionId, competence_id, ...v })));
    }
  } catch {
    return { erreur: "La mission n'a pas pu être enregistrée. Réessayez dans un instant." };
  }
  revalidatePath("/missions");
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
