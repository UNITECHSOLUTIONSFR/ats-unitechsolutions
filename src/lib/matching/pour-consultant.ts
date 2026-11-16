import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classementMission, type LigneClassement } from "./classement";
import { lireClassement } from "./stockage";

export interface EvaluationMission {
  mission: { id: string; intitule: string; client: string | null };
  rang: number | null; // place dans le classement (1 = meilleur)
  ligne: LigneClassement;
}

/** Évaluation d'un consultant pour une mission (score, explication, place dans le classement). */
export async function evaluationPourMission(supabase: SupabaseClient, missionId: string, consultantId: string): Promise<EvaluationMission | null> {
  const [{ data: m }, resume] = await Promise.all([
    supabase.from("missions").select("id, intitule, client").eq("id", missionId).maybeSingle(),
    lireClassement(supabase, missionId).catch(() => null),
  ]);
  if (!m) return null;
  const i = resume?.top.findIndex((l) => l.consultant_id === consultantId) ?? -1;
  if (resume && i >= 0) return { mission: m, rang: i + 1, ligne: resume.top[i] };
  // Hors des 60 premiers : calcul direct pour cette personne (rang approché depuis les scores rangés).
  const classement = await classementMission(supabase, missionId, 1, consultantId).catch(() => [] as LigneClassement[]);
  const ligne = classement.find((l) => l.consultant_id === consultantId);
  if (!ligne) return null;
  const { data: devant } = resume ? await supabase.rpc("rang_dans_classement", { p_mission_id: missionId, p_score: ligne.resultat.score }) : { data: null };
  const rang = devant === null || devant === undefined ? null : Number(devant) + 1;
  return { mission: m, rang: ligne.resultat.elimine ? null : rang, ligne };
}

export interface MissionPourLui { mission: { id: string; intitule: string; client: string | null }; score: number }

/** Missions ouvertes pour lesquelles le consultant est qualifié (non écarté, score ≥ seuil), les meilleures d'abord. Lu dans les classements rangés. */
export async function missionsPourConsultant(supabase: SupabaseClient, consultantId: string, seuil = 50): Promise<MissionPourLui[]> {
  const [{ data: missions }, { data: scores }] = await Promise.all([
    supabase.from("missions").select("id, intitule, client").eq("statut", "ouverte").order("created_at", { ascending: false }).limit(30),
    supabase.rpc("scores_consultant", { p_consultant_id: consultantId }),
  ]);
  const parMission = new Map(((scores ?? []) as { mission_id: string; score: number; ecarte: boolean }[]).map((s) => [s.mission_id, s]));
  return (missions ?? []).flatMap((m) => {
    const s = parMission.get(m.id);
    return s && !s.ecarte && Number(s.score) >= seuil ? [{ mission: m, score: Number(s.score) }] : [];
  }).sort((a, b) => b.score - a.score);
}
