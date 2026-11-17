import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { noterCandidats, type UsageIA } from "@/lib/ai";
import { enregistrerUsages, etatBudgetMois } from "@/lib/ai/journal";
import { classementMission, type LigneClassement } from "./classement";
import { assurerEmpreinteMission, texteMission } from "./empreintes";

/**
 * Matching (méthode du 17/11/2026), en trois temps :
 * 1. Présélection combinée : les profils les plus proches de la mission par le SENS (empreintes Voyage AI) et ceux qui ont
 *    les compétences demandées (MOTS exacts) sont fusionnés par « fusion des rangs » (méthode standard des moteurs de
 *    recherche : un profil bien placé dans l'une ou l'autre liste remonte).
 * 2. Décision par l'IA : elle lit la mission entière et les 60 premiers profils (sans nom ni coordonnées) et donne à chacun
 *    une note sur 100 avec une raison. Chaque note est gardée tant que la mission ne change pas : seuls les nouveaux
 *    entrants sont lus (coût maîtrisé).
 * 3. Apprentissage : les décisions de l'équipe (appelé, envoyé au client, retenu, refusé) sont données à l'IA en exemples.
 * Les filtres éliminatoires (compétences indispensables) restent appliqués ; le score est une aide, jamais un refus.
 */
export const PROFILS_LUS_PAR_IA = 60;
const PAR_APPEL_IA = 30;
/** Profils retenus par le sens avant fusion. */
const PROCHES = 250;
/** Constante de la fusion des rangs (valeur usuelle). */
const K_FUSION = 60;
/** Version des consignes de notation : la changer fait relire tous les profils. */
const VERSION_NOTE = "note-v1";

const verdictDeNote = (n: number): "pertinent" | "a_etudier" | "hors_sujet" => (n >= 70 ? "pertinent" : n >= 50 ? "a_etudier" : "hors_sujet");

interface Mission { intitule: string; client: string | null; texte_besoin: string | null; localisation: string | null; competences: { nom: string; obligatoire: boolean }[] }

async function chargerMission(supabase: SupabaseClient, missionId: string): Promise<Mission | null> {
  const { data: m } = await supabase.from("missions").select("intitule, client, texte_besoin, localisation, mission_competences(obligatoire, competences(nom_canonique))").eq("id", missionId).maybeSingle();
  if (!m) return null;
  const competences = ((m.mission_competences ?? []) as unknown as { obligatoire: boolean; competences: { nom_canonique: string } | null }[])
    .map((c) => ({ nom: c.competences?.nom_canonique ?? "?", obligatoire: c.obligatoire }));
  return { intitule: m.intitule, client: m.client, texte_besoin: m.texte_besoin, localisation: m.localisation, competences };
}

/** Classement complet d'une mission (tous les profils évalués), dans l'ordre affiché. */
export async function classerMission(supabase: SupabaseClient, missionId: string): Promise<LigneClassement[]> {
  const mission = await chargerMission(supabase, missionId);
  if (!mission) return [];

  // 1. Proches par le sens (si les empreintes sont disponibles ; sinon, compétences seules).
  const texteEmpreinte = texteMission({ intitule: mission.intitule, texte_besoin: mission.texte_besoin, competences: mission.competences.map((c) => c.nom) });
  const avecSens = await assurerEmpreinteMission(supabase, missionId, texteEmpreinte).catch((e) => { console.error("Empreinte mission :", (e as Error).message); return false; });
  const { data: proches } = avecSens ? await supabase.rpc("proches_mission", { p_mission_id: missionId, p_nombre: PROCHES }) : { data: [] };
  const rangSens = new Map(((proches ?? []) as { consultant_id: string; similarite: number }[]).map((p, i) => [p.consultant_id, { rang: i + 1, similarite: p.similarite }]));

  // 2. Compétences exactes : toute la base, plus les profils proches par le sens (évalués même sans mot-clé).
  const lignes = await classementMission(supabase, missionId, 100_000, [...rangSens.keys()]);
  const nonEcartes = lignes.filter((l) => !l.resultat.elimine);
  const rangMots = new Map(nonEcartes.map((l, i) => [l.consultant_id, i + 1]));
  const fusion = (id: string) => (rangMots.has(id) ? 1 / (K_FUSION + rangMots.get(id)!) : 0) + (rangSens.has(id) ? 1 / (K_FUSION + rangSens.get(id)!.rang) : 0);
  for (const l of lignes) l.similarite = rangSens.get(l.consultant_id)?.similarite ?? null;
  const preselection = [...nonEcartes].sort((a, b) => fusion(b.consultant_id) - fusion(a.consultant_id));

  // 3. Notes de l'IA sur les 60 premiers (seuls les profils pas encore notés pour cette version de la mission sont lus).
  const texteIA = [
    `Poste : ${mission.intitule}`, mission.client && `Client : ${mission.client}`, mission.localisation && `Lieu : ${mission.localisation}`,
    mission.competences.length && `Compétences demandées : ${mission.competences.map((c) => `${c.nom}${c.obligatoire ? " (indispensable)" : ""}`).join(", ")}`,
    `Description :\n${mission.texte_besoin ?? ""}`,
  ].filter(Boolean).join("\n");
  const empreinte = createHash("sha256").update(`${texteIA}|${VERSION_NOTE}`).digest("hex").slice(0, 32);
  const aLire = preselection.slice(0, PROFILS_LUS_PAR_IA);
  const notes = await notesIA(supabase, missionId, texteIA, empreinte, aLire);

  // Ordre final : profils notés (meilleure note d'abord), puis les autres non écartés (présélection), puis les écartés.
  const ordre = new Map(preselection.map((l, i) => [l.consultant_id, i]));
  const avecAvis = lignes.map((l) => {
    const n = notes.get(l.consultant_id);
    return { ...l, avisIA: n ? { verdict: verdictDeNote(n.note), raison: n.raison, note: n.note } : null };
  });
  const groupe = (l: LigneClassement) => (l.resultat.elimine ? 2 : l.avisIA ? 0 : 1);
  return avecAvis.sort((a, b) => groupe(a) - groupe(b)
    || (b.avisIA?.note ?? 0) - (a.avisIA?.note ?? 0)
    || (ordre.get(a.consultant_id) ?? 1e9) - (ordre.get(b.consultant_id) ?? 1e9)
    || b.resultat.score - a.resultat.score);
}

/** Notes déjà rendues + notes des profils nouveaux (lus par l'IA, 30 par appel, dans le budget mensuel). */
async function notesIA(supabase: SupabaseClient, missionId: string, texteIA: string, empreinte: string, aLire: LigneClassement[]): Promise<Map<string, { note: number; raison: string | null }>> {
  const ids = aLire.map((l) => l.consultant_id);
  const notes = new Map<string, { note: number; raison: string | null }>();
  if (!ids.length) return notes;
  const { data: existants } = await supabase.from("avis_matching").select("consultant_id, note, raison, empreinte").eq("mission_id", missionId).in("consultant_id", ids);
  for (const a of existants ?? []) if (a.empreinte === empreinte && a.note != null) notes.set(a.consultant_id, { note: a.note, raison: a.raison });

  const manquants = aLire.filter((l) => !notes.has(l.consultant_id));
  if (!manquants.length || (await etatBudgetMois().catch(() => ({ depasse: true }))).depasse) return notes;
  const profils = await textesProfils(supabase, manquants);
  const exemples = await exemplesEquipe(supabase, missionId);
  const usages: UsageIA[] = [];
  try {
    const lots = Array.from({ length: Math.ceil(manquants.length / PAR_APPEL_IA) }, (_, i) => manquants.slice(i * PAR_APPEL_IA, (i + 1) * PAR_APPEL_IA));
    await Promise.all(lots.map(async (lot) => {
      // Profils envoyés sans nom ni coordonnées : référence C1, C2…
      const refs = lot.map((l, i) => ({ ref: `C${i + 1}`, id: l.consultant_id, texte: profils.get(l.consultant_id) ?? `Titre : ${l.intitule_poste ?? "non renseigné"}` }));
      try {
        const r = await noterCandidats(texteIA, refs.map(({ ref, texte }) => ({ ref, texte })), exemples);
        usages.push(...r.usages);
        const lignesAvis = r.donnees.notes.map((a) => ({ a, id: refs.find((x) => x.ref === a.ref)?.id })).filter((x) => x.id).map(({ a, id }) => {
          const note = Math.max(0, Math.min(100, Math.round(a.note)));
          return { mission_id: missionId, consultant_id: id!, empreinte, note, verdict: verdictDeNote(note), raison: a.raison.slice(0, 300), modele: r.modele, updated_at: new Date().toISOString() };
        });
        if (lignesAvis.length) await supabase.from("avis_matching").upsert(lignesAvis);
        for (const l of lignesAvis) notes.set(l.consultant_id, { note: l.note, raison: l.raison });
      } catch (e) {
        usages.push(...((e as { usages?: UsageIA[] }).usages ?? []));
        console.error("Notes IA :", (e as Error).message);
      }
    }));
  } finally {
    await enregistrerUsages(usages, `matching:${missionId}`).catch(() => {});
  }
  return notes;
}

/** Texte de chaque profil pour l'IA (sans nom ni coordonnées) : titre, expérience, résumé, compétences, sinon extrait du CV. */
async function textesProfils(supabase: SupabaseClient, lignes: LigneClassement[]): Promise<Map<string, string>> {
  const ids = lignes.map((l) => l.consultant_id);
  const [{ data: profils }, { data: comps }, { data: textes }] = await Promise.all([
    supabase.from("profils").select("consultant_id, resume, annees_experience, seniorite, secteurs").in("consultant_id", ids),
    supabase.from("consultant_competences").select("consultant_id, annees, competences(nom_canonique)").in("consultant_id", ids),
    supabase.from("textes_consultants").select("consultant_id, texte").in("consultant_id", ids),
  ]);
  const parProfil = new Map((profils ?? []).map((p) => [p.consultant_id as string, p]));
  const parTexte = new Map((textes ?? []).map((t) => [t.consultant_id as string, String(t.texte ?? "")]));
  const compsPar = new Map<string, string[]>();
  for (const c of (comps ?? []) as unknown as { consultant_id: string; annees: number | null; competences: { nom_canonique: string } | null }[]) {
    compsPar.set(c.consultant_id, [...(compsPar.get(c.consultant_id) ?? []), `${c.competences?.nom_canonique ?? "?"}${c.annees ? ` ${c.annees} an(s)` : ""}`]);
  }
  return new Map(lignes.map((l) => {
    const p = parProfil.get(l.consultant_id);
    return [l.consultant_id, [
      `Titre : ${l.intitule_poste ?? "non renseigné"}`,
      p?.annees_experience != null && `Expérience : ${p.annees_experience} ans${p.seniorite ? ` (${p.seniorite})` : ""}`,
      p?.resume && `Résumé : ${p.resume}`,
      compsPar.get(l.consultant_id)?.length && `Compétences : ${compsPar.get(l.consultant_id)!.slice(0, 25).join(", ")}`,
      !p?.resume && parTexte.get(l.consultant_id) && `Extrait du CV : ${parTexte.get(l.consultant_id)!.replace(/\s+/g, " ").slice(0, 900)}`,
    ].filter(Boolean).join("\n")];
  }));
}

/**
 * Apprentissage : dernières décisions de l'équipe (cette mission d'abord, puis les autres), résumées sans nom ni coordonnées.
 * Exemple : « Retenu pour "Testeur QA" : Testeur QA, 6 ans, Selenium, Jira ».
 */
async function exemplesEquipe(supabase: SupabaseClient, missionId: string): Promise<string> {
  const { data } = await supabase.from("propositions")
    .select("mission_id, statut, missions(intitule), consultants(intitule_poste, profils(annees_experience), consultant_competences(competences(nom_canonique)))")
    .in("statut", ["appele", "envoye_client", "retenu", "refuse"]).order("updated_at", { ascending: false }).limit(60);
  const LIBELLE: Record<string, string> = { appele: "Appelé", envoye_client: "Envoyé au client", retenu: "Retenu", refuse: "Écarté par l'équipe" };
  const lignes = ((data ?? []) as unknown as {
    mission_id: string; statut: string; missions: { intitule: string } | null;
    consultants: { intitule_poste: string | null; profils: { annees_experience: number | null } | null; consultant_competences: { competences: { nom_canonique: string } | null }[] } | null;
  }[]).sort((a, b) => Number(b.mission_id === missionId) - Number(a.mission_id === missionId));
  const positifs = lignes.filter((l) => l.statut !== "refuse").slice(0, 6);
  const negatifs = lignes.filter((l) => l.statut === "refuse").slice(0, 6);
  return [...positifs, ...negatifs].map((l) => {
    const c = l.consultants;
    const comps = (c?.consultant_competences ?? []).map((k) => k.competences?.nom_canonique).filter(Boolean).slice(0, 8).join(", ");
    return `- ${LIBELLE[l.statut]} pour « ${l.missions?.intitule ?? "?"} »${l.mission_id === missionId ? " (cette mission)" : ""} : ${c?.intitule_poste ?? "titre inconnu"}${c?.profils?.annees_experience ? `, ${c.profils.annees_experience} ans` : ""}${comps ? `, ${comps}` : ""}`;
  }).join("\n");
}
