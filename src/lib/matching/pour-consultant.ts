import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classementMission, type LigneClassement } from "./classement";
import { classementEnCache } from "./cache";

export interface EvaluationMission {
  mission: { id: string; intitule: string; client: string | null };
  rang: number | null; // place dans le classement (1 = meilleur)
  ligne: LigneClassement;
}

/** Évaluation d'un consultant pour une mission (score, explication, place dans le classement). */
export async function evaluationPourMission(supabase: SupabaseClient, missionId: string, consultantId: string): Promise<EvaluationMission | null> {
  const [{ data: m }, resume] = await Promise.all([
    supabase.from("missions").select("id, intitule, client").eq("id", missionId).maybeSingle(),
    classementEnCache(missionId).catch(() => null),
  ]);
  if (!m) return null;
  const i = resume?.top.findIndex((l) => l.consultant_id === consultantId) ?? -1;
  if (resume && i >= 0) return { mission: m, rang: i + 1, ligne: resume.top[i] };
  // Hors des 60 premiers : calcul direct pour cette personne (rang approché depuis les scores gardés en mémoire).
  const classement = await classementMission(supabase, missionId, 1, consultantId).catch(() => [] as LigneClassement[]);
  const ligne = classement.find((l) => l.consultant_id === consultantId);
  if (!ligne) return null;
  const rang = resume ? Object.values(resume.scores).filter(([s, e]) => !e && s > ligne.resultat.score).length + 1 : null;
  return { mission: m, rang: ligne.resultat.elimine ? null : rang, ligne };
}

export interface MissionPourLui { mission: { id: string; intitule: string; client: string | null }; score: number }

/** Missions ouvertes pour lesquelles le consultant est qualifié (non écarté, score ≥ seuil), les meilleures d'abord. Lu en mémoire. */
export async function missionsPourConsultant(supabase: SupabaseClient, consultantId: string, seuil = 50): Promise<MissionPourLui[]> {
  const { data: missions } = await supabase.from("missions").select("id, intitule, client").eq("statut", "ouverte").order("created_at", { ascending: false }).limit(30);
  const res = await Promise.all((missions ?? []).map(async (m) => {
    const s = (await classementEnCache(m.id).catch(() => null))?.scores[consultantId];
    return s && !s[1] && s[0] >= seuil ? { mission: m, score: s[0] } : null;
  }));
  return res.filter((x): x is MissionPourLui => !!x).sort((a, b) => b.score - a.score);
}

/** Nombre de profils pertinents (non écartés, score ≥ 60) d'une mission : même règle que l'écran de la mission. */
export async function nombrePertinents(missionId: string): Promise<number> {
  return (await classementEnCache(missionId).catch(() => null))?.pertinents ?? 0;
}
