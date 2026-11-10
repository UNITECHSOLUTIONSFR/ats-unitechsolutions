import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PROMPT_VERSION } from "@/lib/ai";

/** Coût estimé d'un CV en lot (Haiku 5.5, ~6 000 tokens lus, ~1 500 écrits, prix divisé par 2). */
export const COUT_ESTIME_PAR_CV = (6000 * 0.1 + 1500 * 0.5) / 1_000_000 / 2;

/** CV Word reliés à une fiche et pas encore analysés avec les consignes actuelles. */
export async function cvAAnalyser(supabase: SupabaseClient) {
  const words: { id: string; consultant_id: string; sharepoint_drive_id: string; sharepoint_item_id: string; nom_fichier: string }[] = [];
  for (let debut = 0; ; debut += 1000) {
    const { data } = await supabase
      .from("documents")
      .select("id, consultant_id, sharepoint_drive_id, sharepoint_item_id, nom_fichier")
      .eq("type", "word_nominatif").eq("supprime_sharepoint", false).not("consultant_id", "is", null)
      .not("sharepoint_drive_id", "like", "boite:%") // CV reçus par email : déjà analysés à la réception
      .or("texte_extractible.is.null,texte_extractible.eq.true") // CV scannés : déjà signalés, pas retéléchargés à chaque passage
      .order("modifie_sharepoint_le", { ascending: false })
      .range(debut, debut + 999);
    words.push(...((data ?? []) as typeof words));
    if (!data || data.length < 1000) break;
  }
  const { data: profils } = await supabase.from("profils").select("document_id, prompt_version");
  const echecs = await echecsRecents(supabase);
  const faits = new Set((profils ?? []).filter((p) => p.prompt_version === PROMPT_VERSION).map((p) => p.document_id));
  // Un seul CV par consultant : le plus récent.
  const parConsultant = new Map<string, (typeof words)[number]>();
  // Deux échecs (Haiku puis Sonnet) : le CV n'est plus renvoyé (il est signalé dans « Cas à vérifier »).
  for (const w of words) if (!faits.has(w.id) && (echecs.get(w.id) ?? 0) < 2 && !parConsultant.has(w.consultant_id)) parConsultant.set(w.consultant_id, w);
  return [...parConsultant.values()].map((w) => ({ ...w, repli: (echecs.get(w.id) ?? 0) === 1 }));
}


/** Nombre d'échecs récents de l'IA par CV (d'après les dernières analyses). */
export async function echecsRecents(supabase: SupabaseClient): Promise<Map<string, number>> {
  const { data } = await supabase.from("executions").select("rapport").eq("type", "analyse_cv").eq("statut", "termine")
    .order("created_at", { ascending: false }).limit(30);
  const n = new Map<string, number>();
  for (const e of data ?? []) for (const id of ((e.rapport as { echecIds?: string[] }).echecIds ?? [])) n.set(id, (n.get(id) ?? 0) + 1);
  return n;
}
