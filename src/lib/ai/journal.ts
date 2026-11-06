import "server-only";
import { clientSupabaseAdmin } from "@/lib/supabase/admin";
import type { UsageIA } from "./index";

/** Enregistre chaque appel IA dans la table ai_usage (suivi des coûts). */
export async function enregistrerUsages(usages: UsageIA[], reference?: string) {
  if (!usages.length) return;
  const { error } = await clientSupabaseAdmin()
    .from("ai_usage")
    .insert(usages.map((u) => ({ ...u, reference: reference ?? null })));
  if (error) console.error("Journal des coûts IA :", error.message);
}

/** Cumul du mois en cours et plafond réglé (25 $ par défaut). */
export async function etatBudgetMois(): Promise<{ depense: number; plafond: number; depasse: boolean }> {
  const admin = clientSupabaseAdmin();
  const debut = new Date();
  debut.setUTCDate(1);
  debut.setUTCHours(0, 0, 0, 0);
  const [{ data: lignes }, { data: reglage }] = await Promise.all([
    admin.from("ai_usage").select("cout_estime_usd").gte("created_at", debut.toISOString()),
    admin.from("reglages").select("valeur").eq("cle", "plafond_ia_mensuel_usd").maybeSingle(),
  ]);
  const depense = (lignes ?? []).reduce((s, l) => s + Number(l.cout_estime_usd), 0);
  const plafond = Number(reglage?.valeur ?? 25);
  return { depense, plafond, depasse: depense >= plafond };
}
