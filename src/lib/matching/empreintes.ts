import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Proximité de sens : chaque profil et chaque mission reçoit une « empreinte de sens » (embedding, 384 nombres),
 * calculée gratuitement par le modèle gte-small intégré à Supabase (fonction « embeddings »).
 * Deux textes qui parlent du même travail ont des empreintes proches, même avec des mots différents.
 */
export async function calculerEmpreintes(textes: string[]): Promise<number[][]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, cle = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) throw new Error("Configuration Supabase serveur incomplète");
  // Un texte par appel (limite de calcul du modèle gratuit), 4 appels à la fois.
  const un = async (texte: string, essai = 0): Promise<number[]> => {
    const r = await fetch(`${url}/functions/v1/embeddings`, {
      method: "POST", headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" }, body: JSON.stringify({ textes: [texte] }),
    }).catch(() => null); // coupure réseau : nouvel essai
    if (!r || !r.ok) {
      if (essai < 2) { await new Promise((ok) => setTimeout(ok, 1500)); return un(texte, essai + 1); }
      throw new Error(`Empreintes : ${r?.status ?? "réseau"}`);
    }
    return ((await r.json()) as { vecteurs: number[][] }).vecteurs[0];
  };
  const resultats: number[][] = new Array(textes.length);
  for (let i = 0; i < textes.length; i += 4) {
    const v = await Promise.all(textes.slice(i, i + 4).map((t) => un(t)));
    v.forEach((x, j) => (resultats[i + j] = x));
  }
  return resultats;
}

export function texteProfil(p: { titre?: string | null; resume?: string | null; competences?: string[]; secteurs?: string[] | null }): string {
  return [p.titre && `Poste : ${p.titre}.`, p.resume, p.competences?.length && `Compétences : ${p.competences.join(", ")}.`, p.secteurs?.length && `Secteurs : ${p.secteurs.join(", ")}.`]
    .filter(Boolean).join(" ").slice(0, 1200);
}

export function texteMission(m: { intitule: string; texte_besoin?: string | null; competences?: string[] }): string {
  return [`Poste : ${m.intitule}.`, m.competences?.length && `Compétences : ${m.competences.join(", ")}.`, (m.texte_besoin ?? "").replace(/\s+/g, " ")]
    .filter(Boolean).join(" ").slice(0, 1200);
}

/** Textes envoyés par appel : le modèle gratuit a une limite de ressources par appel. */
const LOT = 8;

/** Calcule les empreintes manquantes (profils analysés, missions ouvertes), par lots de 8, au plus `limite` par passage. */
export async function preparerEmpreintes(supabase: SupabaseClient, limite = 150): Promise<{ profils: number; missions: number }> {
  const bilan = { profils: 0, missions: 0 };
  const { data: missions } = await supabase.from("missions").select("id, intitule, texte_besoin, mission_competences(competences(nom_canonique))")
    .in("statut", ["ouverte", "chez_client"]).is("embedding", null).limit(100);
  for (let i = 0; i < (missions ?? []).length; i += LOT) {
    const lot = missions!.slice(i, i + LOT);
    const v = await calculerEmpreintes(lot.map((m) => texteMission({
      intitule: m.intitule, texte_besoin: m.texte_besoin,
      competences: ((m.mission_competences ?? []) as unknown as { competences: { nom_canonique: string } | null }[]).map((k) => k.competences?.nom_canonique ?? "").filter(Boolean),
    })));
    await Promise.all(lot.map((m, j) => supabase.from("missions").update({ embedding: JSON.stringify(v[j]) }).eq("id", m.id)));
    bilan.missions += lot.length;
  }
  const { data: profils } = await supabase.from("profils").select("id, consultant_id, resume, secteurs").is("embedding", null).limit(limite);
  for (let i = 0; i < (profils ?? []).length; i += LOT) {
    const lot = profils!.slice(i, i + LOT);
    const ids = lot.map((p) => p.consultant_id);
    const [{ data: cs }, { data: comps }] = await Promise.all([
      supabase.from("consultants").select("id, intitule_poste").in("id", ids),
      supabase.from("consultant_competences").select("consultant_id, competences(nom_canonique)").in("consultant_id", ids),
    ]);
    const titre = new Map((cs ?? []).map((c) => [c.id as string, c.intitule_poste as string | null]));
    const kPar = new Map<string, string[]>();
    for (const k of (comps ?? []) as unknown as { consultant_id: string; competences: { nom_canonique: string } | null }[]) kPar.set(k.consultant_id, [...(kPar.get(k.consultant_id) ?? []), k.competences?.nom_canonique ?? ""]);
    const v = await calculerEmpreintes(lot.map((p) => texteProfil({ titre: titre.get(p.consultant_id), resume: p.resume, competences: (kPar.get(p.consultant_id) ?? []).slice(0, 30), secteurs: p.secteurs })));
    await Promise.all(lot.map((p, j) => supabase.from("profils").update({ embedding: JSON.stringify(v[j]) }).eq("id", p.id)));
    bilan.profils += lot.length;
  }
  return bilan;
}
