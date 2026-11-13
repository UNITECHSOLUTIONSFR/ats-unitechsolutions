import "server-only";
import { unstable_cache, updateTag } from "next/cache";
import { clientSupabaseAdmin } from "@/lib/supabase/admin";
import { classementMission, type LigneClassement } from "./classement";

/**
 * Classement d'une mission gardé en mémoire côté serveur : calculé une fois, puis relu instantanément par
 * l'écran de la mission, la liste des missions, le tableau de bord et les fiches consultants.
 * Recalculé quand la mission change (exigences, statut) et au plus tard toutes les 15 minutes (nouveaux CV).
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

export function classementEnCache(missionId: string): Promise<ClassementResume> {
  return unstable_cache(async (): Promise<ClassementResume> => {
    const lignes = await classementMission(clientSupabaseAdmin(), missionId, 100_000);
    return {
      total: lignes.length,
      pertinents: lignes.filter((c) => !c.resultat.elimine && c.resultat.score >= 60).length,
      top: lignes.slice(0, 60),
      scores: Object.fromEntries(lignes.map((l) => [l.consultant_id, [Math.round(l.resultat.score * 10) / 10, l.resultat.elimine]])),
    };
  }, ["classement-v1", missionId], { revalidate: 900, tags: [tag(missionId)] })();
}

/** À appeler après toute modification d'une mission (exigences, statut) : le prochain affichage recalcule. */
export function invaliderClassement(missionId: string) {
  try { updateTag(tag(missionId)); } catch { /* hors action serveur : la limite de 15 minutes s'applique */ }
}
