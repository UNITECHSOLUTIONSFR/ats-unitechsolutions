import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TACHES } from "@/lib/sync/taches";

/**
 * Bilan quotidien des administrateurs : tâches automatiques, échéances des secrets, consommation de l'IA.
 * Affiché sur le tableau de bord (tant que l'outil n'envoie pas d'emails).
 */

/** Délai au-delà duquel une tâche sans réussite est « en retard » (heures). */
const DELAI_HEURES: Record<string, number> = { excel: 26, cv: 26, emails: 3, sauvegarde: 8 * 24 };

export type Etat = "ok" | "retard" | "echec";

export interface EtatTache { nom: string; libelle: string; etat: Etat; derniereReussite: string | null; dernierEchec: string | null }
export interface Echeance { id: string; nom: string; ouRenouveler: string | null; expireLe: string | null; note: string | null; joursRestants: number | null; niveau: "ok" | "bientot" | "urgent" | "expire" | "inconnu" }
export interface ConsoIA { jour: number; semaine: number; mois: number; plafond: number; parUsageSemaine: { usage: string; cout: number }[] }

export interface BilanAdmin { taches: EtatTache[]; echeances: Echeance[]; ia: ConsoIA; problemes: number }

export function etatTache(nom: string, maintenant: number, reussite: string | null, echec: string | null): Etat {
  if (echec && (!reussite || echec > reussite)) return "echec";
  const delai = (DELAI_HEURES[nom] ?? 26) * 3_600_000;
  if (!reussite || maintenant - Date.parse(reussite) > delai) return "retard";
  return "ok";
}

export function niveauEcheance(expireLe: string | null, maintenant: number): { joursRestants: number | null; niveau: Echeance["niveau"] } {
  if (!expireLe) return { joursRestants: null, niveau: "inconnu" };
  const jours = Math.ceil((Date.parse(`${expireLe}T23:59:59Z`) - maintenant) / 86_400_000);
  return { joursRestants: jours, niveau: jours < 0 ? "expire" : jours <= 7 ? "urgent" : jours <= 30 ? "bientot" : "ok" };
}

export async function chargerBilanAdmin(supabase: SupabaseClient, maintenant = Date.now()): Promise<BilanAdmin> {
  const debutJour = new Date(maintenant); debutJour.setHours(0, 0, 0, 0);
  const debutMois = new Date(maintenant); debutMois.setUTCDate(1); debutMois.setUTCHours(0, 0, 0, 0);
  const debutSemaine = new Date(maintenant - 7 * 86_400_000);
  const depuis = new Date(Math.min(debutMois.getTime(), debutSemaine.getTime())).toISOString();
  const planifiees = (["excel", "cv", "emails", "sauvegarde"] as const);

  const [executions, { data: secrets }, { data: usages }, { data: reglage }] = await Promise.all([
    Promise.all(planifiees.map(async (nom) => {
      const type = TACHES[nom].type;
      const [ok, ko] = await Promise.all([
        supabase.from("executions").select("debut").eq("type", type).eq("statut", "termine").order("debut", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("executions").select("debut").eq("type", type).eq("statut", "echec").order("debut", { ascending: false }).limit(1).maybeSingle(),
      ]);
      return { nom, reussite: (ok.data?.debut as string | undefined) ?? null, echec: (ko.data?.debut as string | undefined) ?? null };
    })),
    supabase.from("echeances_secrets").select("id, nom, ou_renouveler, expire_le, note").order("expire_le", { ascending: true, nullsFirst: false }),
    supabase.from("ai_usage").select("usage, cout_estime_usd, created_at").gte("created_at", depuis).limit(20000),
    supabase.from("reglages").select("valeur").eq("cle", "plafond_ia_mensuel_usd").maybeSingle(),
  ]);

  const taches: EtatTache[] = executions.map((e) => ({
    nom: e.nom, libelle: TACHES[e.nom].libelle, etat: etatTache(e.nom, maintenant, e.reussite, e.echec),
    derniereReussite: e.reussite, dernierEchec: e.echec,
  }));

  const echeances: Echeance[] = (secrets ?? []).map((s) => ({
    id: s.id, nom: s.nom, ouRenouveler: s.ou_renouveler, expireLe: s.expire_le, note: s.note, ...niveauEcheance(s.expire_le, maintenant),
  }));

  let jour = 0, semaine = 0, mois = 0;
  const parUsage = new Map<string, number>();
  for (const u of usages ?? []) {
    const c = Number(u.cout_estime_usd) || 0;
    const t = Date.parse(u.created_at);
    if (t >= debutJour.getTime()) jour += c;
    if (t >= debutSemaine.getTime()) { semaine += c; parUsage.set(u.usage, (parUsage.get(u.usage) ?? 0) + c); }
    if (t >= debutMois.getTime()) mois += c;
  }
  const ia: ConsoIA = {
    jour, semaine, mois, plafond: Number(reglage?.valeur ?? 25),
    parUsageSemaine: [...parUsage].map(([usage, cout]) => ({ usage, cout })).sort((a, b) => b.cout - a.cout),
  };

  const problemes = taches.filter((t) => t.etat !== "ok").length
    + echeances.filter((e) => e.niveau === "urgent" || e.niveau === "expire" || e.niveau === "bientot").length
    + (ia.mois >= ia.plafond * 0.8 ? 1 : 0);
  return { taches, echeances, ia, problemes };
}
