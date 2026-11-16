import "server-only";
import { unstable_cache, updateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clientSupabaseAdmin } from "@/lib/supabase/admin";
import { classementMission, type LigneClassement } from "./classement";

/**
 * Classement d'une mission gardé en mémoire côté serveur : calculé une fois, puis relu instantanément par
 * l'écran de la mission, la liste des missions, le tableau de bord et les fiches consultants.
 * Recalculé quand la mission change (exigences, statut), après chaque arrivée de CV (tâches planifiées, en arrière-plan) et au plus tard toutes les heures.
 * Les recruteurs voient de toute façon tous les consultants : le calcul côté serveur ne donne accès à rien de plus.
 */
export interface ClassementResume {
  total: number;
  pertinents: number;
  /** Les 60 premiers, avec le détail du score. */
  top: LigneClassement[];
  /** Score de chaque personne classée : [score, écarté]. */
  scores: Record<string, [number, boolean]>;
}

const tag = (missionId: string) => `classement:${missionId}`;
/** Tous les classements : rafraîchis en arrière-plan après l'arrivée de nouveaux CV (tâches planifiées). */
export const TAG_CLASSEMENTS = "classements";

/** Calculs en cours sur ce serveur : deux écrans qui demandent la même mission attendent le même calcul (jamais deux fois). */
const enCours = new Map<string, Promise<ClassementResume>>();
/** Au plus 2 classements calculés en même temps : la base n'est jamais saturée, même quand 15 missions arrivent d'un coup. */
let actifs = 0;
const file: (() => void)[] = [];
async function avecPlace<T>(f: () => Promise<T>): Promise<T> {
  if (actifs >= 2) await new Promise<void>((ok) => file.push(ok));
  actifs++;
  try { return await f(); } finally { actifs--; file.shift()?.(); }
}

export function classementEnCache(missionId: string): Promise<ClassementResume> {
  const deja = enCours.get(missionId);
  if (deja) return deja;
  const p = lireOuCalculer(missionId).finally(() => enCours.delete(missionId));
  enCours.set(missionId, p);
  return p;
}

function lireOuCalculer(missionId: string): Promise<ClassementResume> {
  return unstable_cache(async (): Promise<ClassementResume> => {
    const lignes = await avecPlace(() => classementMission(clientSupabaseAdmin(), missionId, 100_000));
    return {
      total: lignes.length,
      pertinents: lignes.filter((c) => !c.resultat.elimine && c.resultat.score >= 60).length,
      top: lignes.slice(0, 60),
      scores: Object.fromEntries(lignes.map((l) => [l.consultant_id, [Math.round(l.resultat.score * 10) / 10, l.resultat.elimine]])),
    };
  }, ["classement-v1", missionId], { revalidate: 3600, tags: [tag(missionId), TAG_CLASSEMENTS] })();
}

/**
 * Prépare à l'avance le classement de toutes les missions ouvertes ou chez le client, une par une (tâches planifiées) :
 * les recruteurs n'attendent jamais un calcul en ouvrant l'écran Missions.
 */
export async function prechaufferClassements(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase.from("missions").select("id").in("statut", ["ouverte", "chez_client"]);
  let n = 0;
  for (const m of data ?? []) { await classementEnCache(m.id).catch(() => null); n++; }
  return n;
}

/** À appeler après toute modification d'une mission (exigences, statut) : le prochain affichage recalcule. */
export function invaliderClassement(missionId: string) {
  try { updateTag(tag(missionId)); } catch { /* hors action serveur : la limite d'une heure s'applique */ }
}
