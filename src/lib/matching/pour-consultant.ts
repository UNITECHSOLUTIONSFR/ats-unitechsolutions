import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classementMission, type LigneClassement } from "./classement";

/** Classement d'une mission, calculé une seule fois par affichage de page (même calcul que l'écran de la mission). */
const classementMemo = cache((supabase: SupabaseClient, missionId: string, inclure?: string) => classementMission(supabase, missionId, 50, inclure));

export interface EvaluationMission {
  mission: { id: string; intitule: string; client: string | null };
  rang: number | null; // place dans le classement (1 = meilleur)
  ligne: LigneClassement;
}

/** Évaluation d'un consultant pour une mission (score, explication, place dans le classement). */
export async function evaluationPourMission(supabase: SupabaseClient, missionId: string, consultantId: string): Promise<EvaluationMission | null> {
  const [{ data: m }, classement] = await Promise.all([
    supabase.from("missions").select("id, intitule, client").eq("id", missionId).maybeSingle(),
    classementMemo(supabase, missionId, consultantId).catch(() => [] as LigneClassement[]),
  ]);
  const i = classement.findIndex((l) => l.consultant_id === consultantId);
  if (!m || i < 0) return null;
  return { mission: m, rang: i < 50 ? i + 1 : null, ligne: classement[i] };
}

/** Missions ouvertes pour lesquelles le consultant est qualifié (non écarté, score ≥ seuil), les meilleures d'abord. */
export async function missionsPourConsultant(supabase: SupabaseClient, consultantId: string, seuil = 50): Promise<EvaluationMission[]> {
  const { data: missions } = await supabase.from("missions").select("id").eq("statut", "ouverte").order("created_at", { ascending: false }).limit(30);
  const evals = await Promise.all((missions ?? []).map((m) => evaluationPourMission(supabase, m.id, consultantId)));
  return evals.filter((e): e is EvaluationMission => !!e && !e.ligne.resultat.elimine && e.ligne.resultat.score >= seuil)
    .sort((a, b) => b.ligne.resultat.score - a.ligne.resultat.score);
}

/** Nombre de profils pertinents (non écartés, score ≥ 60) d'une mission : même règle que l'écran de la mission. */
export async function nombrePertinents(supabase: SupabaseClient, missionId: string): Promise<number> {
  // Tout le classement (pas seulement les 50 affichés) pour un nombre exact.
  const classement = await classementMission(supabase, missionId, 5000).catch(() => [] as LigneClassement[]);
  return classement.filter((c) => !c.resultat.elimine && c.resultat.score >= 60).length;
}
