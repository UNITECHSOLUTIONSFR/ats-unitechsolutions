import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EMPREINTES } from "@/lib/ai/config";
import { enregistrerUsages } from "@/lib/ai/journal";
import type { UsageIA } from "@/lib/ai";

/**
 * Empreintes de sens (Voyage AI, modèle multilingue) : 1 024 nombres qui résument de quoi parle un texte.
 * Deux textes qui parlent de la même chose ont des empreintes proches, même avec des mots différents
 * (« recette » et « QA »). Une empreinte n'est recalculée que si son texte change.
 */
const URL_VOYAGE = "https://api.voyageai.com/v1/embeddings";
/** Textes envoyés par appel (Voyage accepte jusqu'à 1 000 textes et environ 120 000 jetons par appel). */
const PAR_APPEL = 40;

export function voyageConfigure(): boolean {
  return !!process.env.VOYAGE_API_KEY;
}

/** Empreintes d'une liste de textes. « document » pour les CV, « query » pour une mission (ce que l'on cherche). */
export async function empreintes(textes: string[], type: "document" | "query"): Promise<{ vecteurs: number[][]; jetons: number }> {
  const cle = process.env.VOYAGE_API_KEY;
  if (!cle) throw new Error("clé Voyage AI absente (VOYAGE_API_KEY)");
  for (let essai = 0; ; essai++) {
    const r = await fetch(URL_VOYAGE, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cle}` },
      body: JSON.stringify({ input: textes, model: EMPREINTES.modele, input_type: type, output_dimension: EMPREINTES.dimension }),
    });
    // Limite de débit ou indisponibilité passagère : nouvel essai après une courte pause.
    if ((r.status === 429 || r.status >= 500) && essai < 3) { await new Promise((ok) => setTimeout(ok, 2000 * (essai + 1))); continue; }
    if (!r.ok) throw new Error(`Voyage AI ${r.status} : ${(await r.text()).slice(0, 200)}`);
    const d = (await r.json()) as { data: { embedding: number[]; index: number }[]; usage?: { total_tokens?: number } };
    const vecteurs: number[][] = [];
    for (const e of d.data) vecteurs[e.index] = e.embedding;
    return { vecteurs, jetons: d.usage?.total_tokens ?? 0 };
  }
}

const enTexte = (v: number[]) => `[${v.join(",")}]`;
const usageEmpreintes = (jetons: number): UsageIA => ({
  usage: "empreintes", modele: EMPREINTES.modele, mode: "standard", tokens_entree: jetons, tokens_sortie: 0,
  tokens_cache_lecture: 0, tokens_cache_ecriture: 0, cout_estime_usd: (jetons / 1_000_000) * EMPREINTES.tarifParMillion,
});

/**
 * Empreintes des consultants nouveaux ou dont le texte a changé (CV analysé, fiche modifiée), dans le temps imparti.
 * Les 200 millions de jetons gratuits couvrent largement la base (≈ 2 000 jetons par consultant).
 */
export async function calculerEmpreintesConsultants(supabase: SupabaseClient, budgetMs = 60_000, limite = 2_000): Promise<{ calculees: number; restantes: boolean }> {
  if (!voyageConfigure()) return { calculees: 0, restantes: false };
  const debut = Date.now();
  const { data, error } = await supabase.rpc("textes_a_empreinter", { p_limite: limite });
  if (error) throw new Error(error.message);
  const aFaire = (data ?? []) as { consultant_id: string; texte: string; empreinte_texte: string }[];
  let calculees = 0, jetons = 0;
  try {
    for (let i = 0; i < aFaire.length; i += PAR_APPEL) {
      if (Date.now() - debut > budgetMs) break;
      const lot = aFaire.slice(i, i + PAR_APPEL);
      const r = await empreintes(lot.map((x) => x.texte), "document");
      jetons += r.jetons;
      const { error: e } = await supabase.from("empreintes_consultants").upsert(lot.map((x, k) => ({
        consultant_id: x.consultant_id, empreinte: enTexte(r.vecteurs[k]), empreinte_texte: x.empreinte_texte, modele: EMPREINTES.modele,
      })));
      if (e) throw new Error(e.message);
      calculees += lot.length;
    }
  } finally {
    if (jetons) await enregistrerUsages([usageEmpreintes(jetons)], "empreintes:consultants").catch(() => {});
  }
  return { calculees, restantes: calculees < aFaire.length || aFaire.length === limite };
}

/** Texte d'une mission pour son empreinte : poste, besoin complet et compétences demandées. */
export function texteMission(m: { intitule: string; texte_besoin: string | null; competences: string[] }): string {
  return [`Poste : ${m.intitule}`, m.competences.length ? `Compétences : ${m.competences.join(", ")}` : "", m.texte_besoin ?? ""].filter(Boolean).join("\n").slice(0, 8000);
}

/** Empreinte d'une mission, recalculée seulement si son texte a changé. Renvoie faux si Voyage n'est pas configuré. */
export async function assurerEmpreinteMission(supabase: SupabaseClient, missionId: string, texte: string): Promise<boolean> {
  if (!voyageConfigure()) return false;
  const empreinte_texte = createHash("md5").update(texte).digest("hex");
  const { data: existante } = await supabase.from("empreintes_missions").select("empreinte_texte").eq("mission_id", missionId).maybeSingle();
  if (existante?.empreinte_texte === empreinte_texte) return true;
  const r = await empreintes([texte], "query");
  await enregistrerUsages([usageEmpreintes(r.jetons)], `empreintes:mission:${missionId}`).catch(() => {});
  const { error } = await supabase.from("empreintes_missions").upsert({ mission_id: missionId, empreinte: enTexte(r.vecteurs[0]), empreinte_texte, modele: EMPREINTES.modele });
  if (error) throw new Error(error.message);
  return true;
}
