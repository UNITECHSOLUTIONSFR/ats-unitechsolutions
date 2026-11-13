import "server-only";
import { gzipSync } from "node:zlib";
import { unstable_cache, updateTag } from "next/cache";
import { clientSupabaseAdmin } from "@/lib/supabase/admin";
import { chargerTableau } from "./chargement";

/**
 * Données de l'écran Consultants préparées une fois côté serveur, compressées (≈ 0,7 Mo au lieu de 3 Mo) :
 * chaque ouverture les relit au lieu de relire 4 800 lignes dans la base. Reconstruites après toute modification
 * (cellule, fiche, import, effacement) et au plus tard toutes les 5 minutes (nouvelles candidatures).
 * Tous les utilisateurs actifs voient les mêmes lignes (règles de la base) : l'accès reste vérifié à chaque demande.
 */
export const tableauCompresse = unstable_cache(async (): Promise<string | null> => {
  const d = await chargerTableau(clientSupabaseAdmin());
  return d ? gzipSync(JSON.stringify(d)).toString("base64") : null;
}, ["tableau-consultants-v1"], { revalidate: 300, tags: ["tableau-consultants"] });

/** À appeler après une modification des consultants ou du tableau. */
export function invaliderTableau() {
  try { updateTag("tableau-consultants"); } catch { /* hors action serveur : limite de 5 minutes */ }
}
