import "server-only";
import { unstable_cache } from "next/cache";
import { clientSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Chiffres de l'accueil, identiques pour tous : comptés une fois côté serveur puis relus instantanément
 * (au plus tard toutes les 5 minutes, et rafraîchis après chaque tâche planifiée). La page reste réservée aux personnes connectées.
 * Les alertes sont comptées par type : chaque écran ne montre ensuite que les types visibles pour la personne.
 */
export const statsAccueil = unstable_cache(async () => {
  const s = clientSupabaseAdmin();
  const compter = async (table: string, filtre?: [string, string]) => {
    let q = s.from(table).select("id", { count: "exact", head: true });
    if (filtre) q = q.eq(filtre[0], filtre[1]);
    return (await q).count ?? 0;
  };
  const [consultants, cvs, missionsOuvertes, { data: alertes }] = await Promise.all([
    compter("consultants"),
    compter("documents", ["type", "word_nominatif"]),
    compter("missions", ["statut", "ouverte"]),
    s.from("alertes").select("type").eq("statut", "ouverte").limit(5000),
  ]);
  const typesAlertes: Record<string, number> = {};
  for (const a of alertes ?? []) typesAlertes[a.type] = (typesAlertes[a.type] ?? 0) + 1;
  return { consultants, cvs, missionsOuvertes, typesAlertes };
}, ["stats-accueil-v1"], { revalidate: 300, tags: ["accueil"] });
