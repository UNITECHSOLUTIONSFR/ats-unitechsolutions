import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extraireCriteresMission, type CriteresMission } from "@/lib/ai";
import { enregistrerUsages } from "@/lib/ai/journal";

/**
 * Matching v2 (18/11/2026) — « la base cherche, l'IA départage ».
 * Chaque mission a un MÉTIER et 0 à 3 CRITÈRES OBLIGATOIRES (spécialisation, secteur, progiciel…), chacun avec ses synonymes.
 * Lus par l'IA dans la mission (relus seulement si son texte change), corrigeables par l'équipe sur l'écran de la mission.
 * Un profil n'est « éligible » que si le texte complet de son CV (et de sa ligne Excel) contient le métier ET chaque critère.
 */
export type { CriteresMission };

const ACCENTS: Record<string, string> = { a: "[aàâäá]", e: "[eéèêë]", i: "[iîïí]", o: "[oôöó]", u: "[uùûüú]", c: "[cç]", y: "[yÿ]" };

/** Expression d'un synonyme : sans tenir compte des accents ; début de mot ; fin de mot aussi pour les sigles courts (« ba », « sap »). */
export function motifSynonyme(synonyme: string): string | null {
  const s = synonyme.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  if (s.length < 2) return null;
  const echappe = [...s].map((ch) => ACCENTS[ch] ?? (/[a-z0-9 ]/.test(ch) ? ch : `\\${ch}`)).join("").replace(/ /g, "[\\s\\-_/]+");
  return `\\m${echappe}${s.length <= 4 ? "\\M" : ""}`;
}

/** Une expression par critère (synonymes réunis par « | ») : métier d'abord, puis chaque critère obligatoire. */
export function motifsCriteres(c: CriteresMission): { libelle: string; motif: string }[] {
  const groupe = (libelle: string, synonymes: string[]) => {
    const parts = [...new Set([libelle, ...synonymes].map(motifSynonyme).filter((x): x is string => !!x))];
    return parts.length ? { libelle, motif: `(${parts.join("|")})` } : null;
  };
  return [groupe(c.metier.libelle, c.metier.synonymes), ...c.obligatoires.map((o) => groupe(o.critere, o.synonymes))].filter((x): x is { libelle: string; motif: string } => !!x);
}

/** Critères de la mission : ceux de l'équipe s'ils ont été corrigés, sinon ceux de l'IA (relus si le texte de la mission change). */
export async function criteresDeLaMission(supabase: SupabaseClient, missionId: string, texteMission: string): Promise<CriteresMission | null> {
  const { data: m } = await supabase.from("missions").select("criteres_matching, criteres_texte, criteres_par_equipe").eq("id", missionId).maybeSingle();
  if (!m) return null;
  const empreinte = createHash("sha256").update(texteMission).digest("hex").slice(0, 32);
  if (m.criteres_matching && (m.criteres_par_equipe || m.criteres_texte === empreinte)) return m.criteres_matching as CriteresMission;
  try {
    const r = await extraireCriteresMission(texteMission);
    await enregistrerUsages(r.usages, `criteres:${missionId}`).catch(() => {});
    const criteres = { ...r.donnees, obligatoires: r.donnees.obligatoires.slice(0, 3) };
    await supabase.from("missions").update({ criteres_matching: criteres, criteres_texte: empreinte }).eq("id", missionId);
    return criteres;
  } catch (e) {
    const usages = (e as { usages?: Parameters<typeof enregistrerUsages>[0] }).usages;
    if (usages) await enregistrerUsages(usages, `criteres:${missionId}`).catch(() => {});
    console.error("Critères de la mission :", (e as Error).message);
    return (m.criteres_matching as CriteresMission | null) ?? null;
  }
}

/** Profils éligibles (tous les critères dans leur texte complet). */
export async function profilsEligibles(supabase: SupabaseClient, motifs: string[]): Promise<Set<string>> {
  if (!motifs.length) return new Set();
  const { data, error } = await supabase.rpc("profils_eligibles", { p_motifs: motifs });
  if (error) throw new Error(`Recherche des profils : ${error.message}`);
  return new Set(((data ?? []) as unknown as string[]).map((x) => (typeof x === "string" ? x : (x as { profils_eligibles: string }).profils_eligibles)));
}

/** Pour quelques profils non éligibles : les critères qui leur manquent (libellés). */
export async function criteresManquants(supabase: SupabaseClient, groupes: { libelle: string; motif: string }[], ids: string[]): Promise<Map<string, string[]>> {
  if (!groupes.length || !ids.length) return new Map();
  const { data } = await supabase.rpc("motifs_par_profil", { p_motifs: groupes.map((g) => g.motif), p_ids: ids });
  const res = new Map<string, string[]>(ids.map((id) => [id, groupes.map((g) => g.libelle)]));
  for (const r of (data ?? []) as { consultant_id: string; remplis: boolean[] }[]) res.set(r.consultant_id, groupes.filter((_, i) => !r.remplis[i]).map((g) => g.libelle));
  return res;
}
