import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { trierCandidats, type UsageIA } from "@/lib/ai";
import { enregistrerUsages, etatBudgetMois } from "@/lib/ai/journal";
import type { LigneClassement } from "./classement";

/** Nombre de profils lus par l'IA pour chaque mission (les mieux classés par le premier tri). */
export const PROFILS_LUS_PAR_IA = 30;
const RANG = { pertinent: 0, a_etudier: 1, hors_sujet: 3 } as const;

/**
 * Matching avec IA, 2e temps : l'IA lit la mission entière et les 30 premiers profils (sans nom ni coordonnées)
 * et dit pour chacun « pertinent », « à étudier » ou « hors sujet », avec une raison.
 * Chaque avis est gardé tant que la mission ne change pas : un profil n'est lu qu'une fois par version de mission.
 * Ordre final : pertinents, à étudier, non lus, puis hors sujet et écartés.
 */
export async function trierParIA(supabase: SupabaseClient, missionId: string, lignes: LigneClassement[]): Promise<LigneClassement[]> {
  const { data: m } = await supabase.from("missions").select("intitule, client, texte_besoin, localisation, mission_competences(competence_id, obligatoire, competences(nom_canonique))").eq("id", missionId).maybeSingle();
  if (!m) return lignes;
  const competences = ((m.mission_competences ?? []) as unknown as { competence_id: string; obligatoire: boolean; competences: { nom_canonique: string } | null }[]);
  const texteMission = [
    `Poste : ${m.intitule}`, m.client && `Client : ${m.client}`, m.localisation && `Lieu : ${m.localisation}`,
    competences.length && `Compétences demandées : ${competences.map((c) => `${c.competences?.nom_canonique ?? "?"}${c.obligatoire ? " (indispensable)" : ""}`).join(", ")}`,
    `Description :\n${m.texte_besoin ?? ""}`,
  ].filter(Boolean).join("\n");
  const empreinte = createHash("sha256").update(`${texteMission}|v1`).digest("hex").slice(0, 32);

  const aLire = lignes.filter((l) => !l.resultat.elimine).slice(0, PROFILS_LUS_PAR_IA);
  const ids = aLire.map((l) => l.consultant_id);
  const { data: existants } = ids.length
    ? await supabase.from("avis_matching").select("consultant_id, verdict, raison, empreinte").eq("mission_id", missionId).in("consultant_id", ids)
    : { data: [] };
  const avis = new Map((existants ?? []).filter((a) => a.empreinte === empreinte).map((a) => [a.consultant_id as string, { verdict: a.verdict, raison: a.raison }]));

  const manquants = aLire.filter((l) => !avis.has(l.consultant_id));
  if (manquants.length && !(await etatBudgetMois().catch(() => ({ depasse: true }))).depasse) {
    const mIds = manquants.map((l) => l.consultant_id);
    const [{ data: profils }, { data: comps }, { data: textes }] = await Promise.all([
      supabase.from("profils").select("consultant_id, resume, annees_experience, seniorite, secteurs").in("consultant_id", mIds),
      supabase.from("consultant_competences").select("consultant_id, annees, competences(nom_canonique)").in("consultant_id", mIds),
      supabase.from("textes_consultants").select("consultant_id, texte").in("consultant_id", mIds),
    ]);
    const parProfil = new Map((profils ?? []).map((p) => [p.consultant_id as string, p]));
    const parTexte = new Map((textes ?? []).map((t) => [t.consultant_id as string, String(t.texte ?? "")]));
    const compsPar = new Map<string, string[]>();
    for (const c of (comps ?? []) as unknown as { consultant_id: string; annees: number | null; competences: { nom_canonique: string } | null }[]) {
      compsPar.set(c.consultant_id, [...(compsPar.get(c.consultant_id) ?? []), `${c.competences?.nom_canonique ?? "?"}${c.annees ? ` ${c.annees} an(s)` : ""}`]);
    }
    // Profils envoyés sans nom ni coordonnées : référence C1, C2…
    const refs = manquants.map((l, i) => {
      const p = parProfil.get(l.consultant_id);
      const texte = [
        `Titre : ${l.intitule_poste ?? "non renseigné"}`,
        p?.annees_experience != null && `Expérience : ${p.annees_experience} ans${p.seniorite ? ` (${p.seniorite})` : ""}`,
        p?.resume && `Résumé : ${p.resume}`,
        compsPar.get(l.consultant_id)?.length && `Compétences : ${compsPar.get(l.consultant_id)!.slice(0, 25).join(", ")}`,
        !p?.resume && parTexte.get(l.consultant_id) && `Extrait du CV : ${parTexte.get(l.consultant_id)!.replace(/\s+/g, " ").slice(0, 700)}`,
      ].filter(Boolean).join("\n");
      return { ref: `C${i + 1}`, id: l.consultant_id, texte };
    });
    const usages: UsageIA[] = [];
    try {
      const r = await trierCandidats(texteMission, refs.map(({ ref, texte }) => ({ ref, texte })));
      usages.push(...r.usages);
      const lignesAvis = r.donnees.avis.map((a) => ({ a, id: refs.find((x) => x.ref === a.ref)?.id })).filter((x) => x.id)
        .map(({ a, id }) => ({ mission_id: missionId, consultant_id: id!, empreinte, verdict: a.verdict, raison: a.raison.slice(0, 300), modele: r.modele, updated_at: new Date().toISOString() }));
      if (lignesAvis.length) await supabase.from("avis_matching").upsert(lignesAvis);
      for (const l of lignesAvis) avis.set(l.consultant_id, { verdict: l.verdict, raison: l.raison });
    } catch (e) {
      usages.push(...((e as { usages?: UsageIA[] }).usages ?? []));
      console.error("Tri IA :", (e as Error).message);
    } finally {
      await enregistrerUsages(usages, `matching:${missionId}`).catch(() => {});
    }
  }

  const avecAvis = lignes.map((l) => ({ ...l, avisIA: (avis.get(l.consultant_id) as LigneClassement["avisIA"]) ?? null }));
  const rang = (l: LigneClassement) => (l.resultat.elimine ? 4 : l.avisIA ? RANG[l.avisIA.verdict] : 2);
  return avecAvis.map((l, i) => [l, i] as const).sort((a, b) => rang(a[0]) - rang(b[0]) || a[1] - b[1]).map(([l]) => l);
}
