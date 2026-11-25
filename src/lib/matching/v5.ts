import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { noterCriteres, type UsageIA } from "@/lib/ai";
import { enregistrerUsages, etatBudgetMois } from "@/lib/ai/journal";
import { MODELES } from "@/lib/ai/config";
import type { LigneClassement } from "./classement";
import { chargerMission } from "./hybride";
import { assurerEmpreinteMission, texteMission } from "./empreintes";
import { preparerMissionV3 } from "./v3";
import { detailDepuis, empreinte, lignesDepuisNotes, rangement, texteMissionCriteres, type Note } from "./v4";

/**
 * Matching par le sens (décision de l'utilisatrice du 25/11/2026), comme les outils du marché :
 * 1. chaque CV a son empreinte de sens (Voyage), calculée une fois à son arrivée ;
 * 2. chaque mission est comparée par le sens à TOUS les CV lisibles de la base, sans aucun tri (ni métier, ni compétence) ;
 * 3. l'IA lit EN ENTIER les 500 CV les plus proches et les note critère par critère (atteint / partiel / non) ;
 *    affichés : les profils notés 31 ou plus, du plus haut au plus bas ;
 * 4. une nouvelle mission (Trello) est lue automatiquement ; un nouveau CV est comparé aux missions ouvertes dès qu'il a son
 *    empreinte, et lu pour celles où il est au moins aussi proche que le 500e ;
 * 5. chaque note est gardée (mission + texte du CV) : rien n'est jamais repayé.
 */
export const VERSION_MOTEUR_V5 = "2026-11-25.1-sens-500";
/** Nombre de CV lus en entier par l'IA pour chaque mission (décision du 25/11/2026). */
export const CV_LUS_PAR_MISSION = 500;
const PAR_APPEL = 5;
const EN_PARALLELE = 10;

export async function matchingV5Actif(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase.from("reglages").select("valeur").eq("cle", "matching_v5").maybeSingle();
  return data?.valeur === true;
}

/** Texte complet des CV (anonymisé : nom, prénom, email et téléphone retirés), avec l'empreinte du texte. */
async function textesComplets(supabase: SupabaseClient, ids: string[]): Promise<Map<string, { texte: string; hash: string }>> {
  const out = new Map<string, { texte: string; hash: string }>();
  for (let i = 0; i < ids.length; i += 200) {
    const part = ids.slice(i, i + 200);
    const [{ data, error }, { data: fiches }] = await Promise.all([
      supabase.rpc("textes_cv_complets", { p_ids: part }),
      supabase.from("consultants").select("id, prenom, nom").in("id", part),
    ]);
    if (error) throw new Error(error.message);
    const noms = new Map((fiches ?? []).map((f) => [f.id as string, [f.prenom, ...String(f.nom ?? "").split(/\s+/)].filter((x) => x && x !== "—" && x.length > 2) as string[]]));
    for (const d of (data ?? []) as { consultant_id: string; texte: string; texte_hash: string }[]) {
      const t = (noms.get(d.consultant_id) ?? []).reduce((acc, n) => acc.replace(new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "[nom]"), d.texte)
        .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]").replace(/(?:\+33\s?|0)[1-9](?:[ .-]?\d{2}){4}/g, "[téléphone]")
        .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").slice(0, 9000);
      out.set(d.consultant_id, { texte: t, hash: d.texte_hash });
    }
  }
  return out;
}

/** Notes des CV donnés pour une mission : celles déjà gardées sont reprises, les autres demandées à l'IA (dans le temps imparti). */
async function noter(supabase: SupabaseClient, missionId: string, ids: string[], usages: UsageIA[], finAvant: number): Promise<{ notes: Map<string, Note>; manquants: number }> {
  const notes = new Map<string, Note>();
  if (!ids.length) return { notes, manquants: 0 };
  const mission = await texteMissionCriteres(supabase, missionId);
  const cleMission = empreinte(mission);
  const [textes, deja] = await Promise.all([textesComplets(supabase, ids), (async () => {
    const r: { consultant_id: string; empreinte: string; note: number; raison: string | null; detail: unknown }[] = [];
    for (let i = 0; ; i += 1000) {
      const { data } = await supabase.from("notes_v3").select("consultant_id, empreinte, note, raison, detail").eq("mission_id", missionId).eq("etape", "cv").range(i, i + 999);
      r.push(...((data ?? []) as typeof r));
      if (!data || data.length < 1000) break;
    }
    return r;
  })()]);
  const cles = new Map([...textes].map(([id, t]) => [id, empreinte(cleMission, t.hash)]));
  for (const d of deja) if (cles.get(d.consultant_id) === d.empreinte) notes.set(d.consultant_id, { note: d.note, raison: d.raison ?? "", detail: d.detail as Note["detail"] });
  const aLire = ids.filter((id) => !notes.has(id) && cles.has(id));
  if (aLire.length && (await etatBudgetMois().catch(() => ({ depasse: true }))).depasse) return { notes, manquants: aLire.length };
  const lots = Array.from({ length: Math.ceil(aLire.length / PAR_APPEL) }, (_, i) => aLire.slice(i * PAR_APPEL, (i + 1) * PAR_APPEL));
  for (let i = 0; i < lots.length && Date.now() < finAvant; i += EN_PARALLELE) {
    await Promise.all(lots.slice(i, i + EN_PARALLELE).map(async (lot) => {
      const texte = `${mission}\n\n${lot.map((id, k) => `===== C${k + 1} =====\n${textes.get(id)!.texte}`).join("\n\n")}`;
      try {
        const r = await noterCriteres(texte);
        usages.push(...r.usages);
        const lignes = r.donnees.notes.map((n) => ({ n, id: lot[Number(n.ref.match(/(\d+)/)?.[1] ?? 0) - 1] })).filter((x) => x.id).map(({ n, id }) => {
          const note = Math.max(0, Math.min(100, Math.round(n.note)));
          return { mission_id: missionId, consultant_id: id, etape: "cv", empreinte: cles.get(id)!, note, bon: note >= 70, raison: n.raison.slice(0, 300), detail: detailDepuis(n), modele: MODELES.noteCriteres, updated_at: new Date().toISOString() };
        });
        if (lignes.length) await supabase.from("notes_v3").upsert(lignes);
        for (const l of lignes) notes.set(l.consultant_id, { note: l.note, raison: l.raison, detail: l.detail });
      } catch (e) {
        usages.push(...((e as { usages?: UsageIA[] }).usages ?? []));
        console.error("Matching par le sens :", (e as Error).message);
      }
    }));
  }
  return { notes, manquants: ids.filter((id) => cles.has(id) && !notes.has(id)).length };
}

/**
 * Lecture d'une mission : comparée par le sens à toute la base, puis les 500 plus proches lus en entier par l'IA.
 * Les profils déjà notés s'affichent tout de suite ; s'il en manque (temps écoulé, IA indisponible), la lecture reprend au
 * passage suivant sans rien repayer.
 */
export async function lireMissionV5(supabase: SupabaseClient, missionId: string, finAvant: number): Promise<{ pertinents: number; manquants: number }> {
  const debut = Date.now();
  const m = await chargerMission(supabase, missionId);
  if (!m) throw new Error("Mission introuvable.");
  const texte = texteMission({ intitule: m.intitule, texte_besoin: m.texte_besoin, competences: m.competences.map((c) => c.nom) });
  if (!(await assurerEmpreinteMission(supabase, missionId, texte))) throw new Error("Service d'empreintes indisponible.");
  // Critères de la mission (déjà lus par l'IA à l'arrivée de la mission) : la liste évaluée par l'IA, dans l'ordre.
  await preparerMissionV3(supabase, missionId).catch(() => false);
  const { data, error } = await supabase.rpc("classement_sens", { p_mission: missionId, p_limite: CV_LUS_PAR_MISSION });
  if (error) throw new Error(error.message);
  const proches = (data ?? []) as { consultant_id: string; sim: number }[];
  const usages: UsageIA[] = [];
  try {
    const { notes, manquants } = await noter(supabase, missionId, proches.map((p) => p.consultant_id), usages, finAvant);
    if (proches.length && !notes.size) throw new Error("Plafond IA atteint ou IA indisponible : la lecture reprendra au prochain passage.");
    const r = rangement(await lignesDepuisNotes(supabase, notes, new Map(proches.map((p) => [p.consultant_id, p.sim]))));
    await supabase.from("classements_mission").upsert({
      mission_id: missionId, ...r, calcule_le: new Date().toISOString(), duree_ms: Date.now() - debut, version: VERSION_MOTEUR_V5,
      a_recalculer: manquants > 0, en_calcul_depuis: null, erreur: null,
      seuil_sens: proches.length ? proches[proches.length - 1].sim : null,
      cv_verifies_le: new Date(debut).toISOString(),
    });
    return { pertinents: r.pertinents, manquants };
  } finally {
    await enregistrerUsages(usages, `matching_v5:${missionId}`).catch(() => undefined);
  }
}

/** Nouveaux CV (empreinte calculée depuis la dernière vérification) comparés à une mission déjà lue ; ajoutés à ses profils. */
export async function nouveauxCVMissionV5(supabase: SupabaseClient, missionId: string, depuis: string, seuil: number, finAvant: number): Promise<number> {
  const debut = new Date().toISOString();
  const ids: string[] = [];
  for (let i = 0; ; i += 1000) {
    const { data } = await supabase.from("empreintes_consultants").select("consultant_id").gt("updated_at", depuis).range(i, i + 999);
    ids.push(...(data ?? []).map((d) => d.consultant_id as string));
    if (!data || data.length < 1000) break;
  }
  if (!ids.length) { await supabase.from("classements_mission").update({ cv_verifies_le: debut }).eq("mission_id", missionId); return 0; }
  const { data, error } = await supabase.rpc("sens_consultants", { p_mission: missionId, p_ids: ids });
  if (error) throw new Error(error.message);
  const proches = ((data ?? []) as { consultant_id: string; sim: number }[]).filter((p) => p.sim >= seuil);
  if (!proches.length) { await supabase.from("classements_mission").update({ cv_verifies_le: debut }).eq("mission_id", missionId); return 0; }
  const usages: UsageIA[] = [];
  try {
    const { notes, manquants } = await noter(supabase, missionId, proches.map((p) => p.consultant_id), usages, finAvant);
    if (manquants > 0 && !notes.size) return 0; // plafond ou IA indisponible : réessayé au passage suivant
    const nouvelles = await lignesDepuisNotes(supabase, notes, new Map(proches.map((p) => [p.consultant_id, p.sim])));
    const { data: actuel } = await supabase.from("classements_mission").select("top").eq("mission_id", missionId).maybeSingle();
    const garde = ((actuel?.top ?? []) as LigneClassement[]).filter((l) => !notes.has(l.consultant_id));
    const r = rangement([...garde, ...nouvelles]);
    await supabase.from("classements_mission").update({ ...r, cv_verifies_le: manquants > 0 ? depuis : debut }).eq("mission_id", missionId);
    return nouvelles.length;
  } finally {
    await enregistrerUsages(usages, `matching_v5_nouveaux:${missionId}`).catch(() => undefined);
  }
}
