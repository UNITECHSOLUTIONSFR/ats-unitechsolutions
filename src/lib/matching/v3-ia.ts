import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { noterCVComplets, noterDossiers, type NoteDossiers, type UsageIA } from "@/lib/ai";
import { enregistrerUsages, etatBudgetMois } from "@/lib/ai/journal";
import { MODELES } from "@/lib/ai/config";
import { chargerCandidats, type DetailIA, type LigneClassement } from "./classement";
import { preparerMissionV3, texteMissionIA, textesDossiers } from "./v3";
import { contexteMission, SEUILS_V3, type LigneV3 } from "./v3-calcul";
import { textesCV } from "./v3-reference";

/**
 * Matching v3 avec l'IA (23/11/2026), en deux temps, sans liste arbitraire :
 * 1. Candidats = tous les profils du même métier ou d'un métier voisin (proximité calculée par la base sur les CV découpés).
 * 2. L'IA lit leurs parcours RÉSUMÉS (10 par appel) et donne une note.
 * 3. L'IA relit en entier les CV des profils les mieux notés sur leur résumé (5 par appel) et tranche.
 * Affichés : les profils jugés bons à la lecture complète. Chaque note est gardée tant que ni la mission ni le CV ne
 * changent (empreinte) : rien n'est jamais repayé. ≈ 2 à 4 centimes à la première lecture d'une mission.
 */
export const REGLAGES_V3IA = {
  /** Écart de proximité de métier toléré sous les meilleurs profils de la mission pour être candidat. */
  ecartCandidats: 0.1,
  candidatsMax: 150,
  /** Note sur le résumé à partir de laquelle le CV complet est relu. */
  seuilRelecture: 55,
  relecturesMax: 20,
  parAppelResumes: 10,
  parAppelComplets: 5,
};

type Note = { note: number; bon: boolean; raison: string | null; detail: DetailIA | null };

const empreinte = (...parties: string[]) => createHash("md5").update(parties.join("|")).digest("hex");

/** Appels en parallèle, 4 à la fois au plus. */
async function parPaquets<T>(taches: (() => Promise<T>)[], n = 4): Promise<T[]> {
  const res: T[] = [];
  for (let i = 0; i < taches.length; i += n) res.push(...(await Promise.all(taches.slice(i, i + n).map((t) => t()))));
  return res;
}

async function lireEtape(supabase: SupabaseClient, missionId: string, etape: "resume" | "complet", ids: string[], cles: Map<string, string>,
  textes: Map<string, string>, mission: string, parAppel: number, appel: (texte: string) => Promise<{ donnees: NoteDossiers; usages: UsageIA[] }>, prefixe: string, usages: UsageIA[]): Promise<Map<string, Note>> {
  const notes = new Map<string, Note>();
  const { data: deja } = await supabase.from("notes_v3").select("consultant_id, empreinte, note, bon, raison, detail").eq("mission_id", missionId).eq("etape", etape);
  for (const d of deja ?? []) if (cles.get(d.consultant_id) === d.empreinte) notes.set(d.consultant_id, { note: d.note, bon: d.bon, raison: d.raison, detail: d.detail as DetailIA | null });
  const manquants = ids.filter((id) => !notes.has(id) && textes.has(id));
  if (!manquants.length || (await etatBudgetMois().catch(() => ({ depasse: true }))).depasse) return notes;
  const lots = Array.from({ length: Math.ceil(manquants.length / parAppel) }, (_, i) => manquants.slice(i * parAppel, (i + 1) * parAppel));
  await parPaquets(lots.map((lot) => async () => {
    const texte = `${mission}\n\n${lot.map((id, k) => `===== ${prefixe}${k + 1} =====\n${textes.get(id)}`).join("\n\n")}`;
    try {
      const r = await appel(texte);
      usages.push(...r.usages);
      const lignes = r.donnees.notes.map((n) => ({ n, id: lot[Number(n.ref.match(/(\d+)/)?.[1] ?? 0) - 1] })).filter((x) => x.id).map(({ n, id }) => {
        const detail: DetailIA = { recapitulatif: n.raison.slice(0, 600), analyse: n.analyse.slice(0, 8).map((a) => ({ exigence: a.exigence.slice(0, 120), atteint: a.atteint, explication: a.explication.slice(0, 400) })) };
        return { mission_id: missionId, consultant_id: id, etape, empreinte: cles.get(id)!, note: Math.max(0, Math.min(100, Math.round(n.note))), bon: n.bon, raison: n.raison.slice(0, 300), detail, modele: MODELES.noteDossiers, updated_at: new Date().toISOString() };
      });
      // Profil sans réponse : PAS noté 0, il sera relu au prochain calcul.
      if (lignes.length) await supabase.from("notes_v3").upsert(lignes);
      for (const l of lignes) notes.set(l.consultant_id, { note: l.note, bon: l.bon, raison: l.raison, detail: l.detail });
    } catch (e) {
      usages.push(...((e as { usages?: UsageIA[] }).usages ?? []));
      console.error(`Notes v3 (${etape}) :`, (e as Error).message);
    }
  }));
  return notes;
}

export async function classerMissionV3IA(supabase: SupabaseClient, missionId: string): Promise<LigneClassement[]> {
  if (!(await preparerMissionV3(supabase, missionId))) throw new Error("Mission sans métier ni exigence, ou service d'empreintes absent.");
  const [{ data, error }, mission] = await Promise.all([supabase.rpc("classement_v3", { p_mission: missionId }), texteMissionIA(supabase, missionId)]);
  if (error) throw new Error(error.message);
  const lignes = (data ?? []) as LigneV3[];
  const R = REGLAGES_V3IA;
  const ctx = contexteMission(lignes, { ...SEUILS_V3, metierEcart: R.ecartCandidats });
  const candidats = lignes.filter((l) => l.metier_sim >= ctx.metierSeuil).sort((a, b) => b.metier_sim - a.metier_sim).slice(0, R.candidatsMax);
  const ids = candidats.map((l) => l.consultant_id);
  const cleMission = empreinte(mission);
  const { data: dossiers } = await supabase.from("dossiers_cv").select("consultant_id, texte_hash").in("consultant_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const cles = new Map((dossiers ?? []).map((d) => [d.consultant_id as string, empreinte(cleMission, d.texte_hash as string)]));
  const usages: UsageIA[] = [];
  try {
    // 1. Résumés de tous les candidats.
    const resumes = await lireEtape(supabase, missionId, "resume", ids, cles, await textesDossiers(supabase, ids), mission, R.parAppelResumes, noterDossiers, "P", usages);
    // 2. CV complets des mieux notés sur leur résumé.
    const retenus = [...resumes.entries()].filter(([, n]) => n.note >= R.seuilRelecture).sort((a, b) => b[1].note - a[1].note).slice(0, R.relecturesMax).map(([id]) => id);
    const complets = await lireEtape(supabase, missionId, "complet", retenus, cles, await textesCV(supabase, retenus), mission, R.parAppelComplets, noterCVComplets, "C", usages);
    // 3. Lignes du classement : affichés = jugés bons à la lecture complète (note ≥ 60) ; les autres restent sous 60.
    const fiches = new Map((await chargerCandidats(supabase, ids)).map((c) => [c.consultant_id, c]));
    const res: LigneClassement[] = [];
    for (const l of candidats) {
      const c = fiches.get(l.consultant_id);
      if (!c) continue;
      const comp = complets.get(l.consultant_id), resu = resumes.get(l.consultant_id);
      const n = comp ?? resu;
      const note = comp ? (comp.bon ? Math.max(comp.note, 60) : Math.min(comp.note, 59)) : Math.min(resu?.note ?? 0, 55);
      res.push({
        consultant_id: c.consultant_id, prenom: c.prenom, nom: c.nom, trigramme: c.trigramme, telephone_e164: c.telephone_e164, email: c.email,
        intitule_poste: c.intitule_poste, disponibilite: c.disponibilite, disponible_le: c.disponible_le, pdf_anonyme_url: c.pdf_anonyme_url,
        word_url: c.word_url?.includes("sharepoint.com") ? c.word_url : null,
        annees_experience: c.annees_experience === null ? null : Number(c.annees_experience),
        resultat: { score: note, elimine: false, motifsElimination: [], raisons: [], alertes: [] },
        avisIA: n ? { verdict: note >= 60 ? "pertinent" : note >= 40 ? "a_etudier" : "hors_sujet", raison: n.raison, note, detail: n.detail } : null,
        similarite: l.metier_sim, eligible: true,
      });
    }
    const tri = res.sort((a, b) => (b.avisIA?.note ?? -1) - (a.avisIA?.note ?? -1) || (b.similarite ?? 0) - (a.similarite ?? 0));
    // CV Word rangé dans SharePoint pour les cartes affichées.
    const sansWord = tri.slice(0, 40).filter((x) => !x.word_url).map((x) => x.consultant_id);
    if (sansWord.length) {
      const { data: docs } = await supabase.from("documents").select("consultant_id, url_web").in("consultant_id", sansWord).eq("type", "word_nominatif")
        .eq("supprime_sharepoint", false).ilike("url_web", "%sharepoint.com%").order("modifie_sharepoint_le", { ascending: false, nullsFirst: false });
      const par = new Map<string, string>();
      for (const d of docs ?? []) if (!par.has(d.consultant_id)) par.set(d.consultant_id, d.url_web);
      for (const x of tri) x.word_url ??= par.get(x.consultant_id) ?? null;
    }
    return tri;
  } finally {
    await enregistrerUsages(usages, `matching_v3:${missionId}`).catch(() => undefined);
  }
}
