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
export async function etatBudgetMois(): Promise<{ depense: number; plafond: number; depasse: boolean; jour: number; plafondJour: number }> {
  const admin = clientSupabaseAdmin();
  const debut = new Date();
  debut.setUTCDate(1);
  debut.setUTCHours(0, 0, 0, 0);
  // Jour commencé à minuit, heure de Paris.
  const paris = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const decalage = new Date(`${paris}T12:00:00Z`).getTime() - new Date(new Date(`${paris}T12:00:00Z`).toLocaleString("en-US", { timeZone: "Europe/Paris" })).getTime();
  const debutJour = new Date(new Date(`${paris}T00:00:00Z`).getTime() + decalage);
  const [{ data: mois }, { data: jour }, { data: reglages }] = await Promise.all([
    admin.rpc("cout_ia_depuis", { p_depuis: debut.toISOString() }),
    admin.rpc("cout_ia_depuis", { p_depuis: debutJour.toISOString() }),
    admin.from("reglages").select("cle, valeur").in("cle", ["plafond_ia_mensuel_usd", "plafond_ia_jour_usd"]),
  ]);
  const valeur = (cle: string, defaut: number) => Number((reglages ?? []).find((r) => r.cle === cle)?.valeur ?? defaut);
  const depense = Number(mois ?? 0), depenseJour = Number(jour ?? 0);
  const plafond = valeur("plafond_ia_mensuel_usd", 25), plafondJour = valeur("plafond_ia_jour_usd", 1);
  // FinOps : plafond du mois ET plafond du jour ; au-delà, plus aucun appel payant jusqu'au lendemain.
  return { depense, plafond, depasse: depense >= plafond || depenseJour >= plafondJour, jour: depenseJour, plafondJour };
}
