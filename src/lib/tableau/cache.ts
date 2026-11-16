import "server-only";
import { after } from "next/server";
import { actualiserProjection } from "./projection";

/**
 * À appeler après une modification des consultants ou du tableau : la projection de l'écran Consultants
 * (table tableau_vue) est mise à jour juste après la réponse (seules les lignes changées sont réécrites).
 */
export function invaliderTableau() {
  try {
    after(() => actualiserProjection().then(() => undefined).catch((e) => console.error("Projection du tableau :", (e as Error).message)));
  } catch {
    // Hors requête (scripts) : la mise à jour de sécurité, toutes les 10 minutes, s'en charge.
  }
}
