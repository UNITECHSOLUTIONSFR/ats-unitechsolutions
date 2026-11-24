import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { noterCriteres, type NoteCriteres, type UsageIA } from "@/lib/ai";
import { enregistrerUsages, etatBudgetMois } from "@/lib/ai/journal";
import { MODELES } from "@/lib/ai/config";
import { chargerCandidats, estPertinent, noteAffichee, type DetailIA, type LigneClassement } from "./classement";
import { preparerMissionV3, texteMissionIA } from "./v3";
import { contexteMission, SEUILS_V3, type LigneV3 } from "./v3-calcul";
import { REGLAGES_V3IA } from "./v3-ia";
import { textesCV } from "./v3-reference";

/**
 * Nouveau matching (décisions de l'utilisatrice du 24/11/2026) :
 * - CV comparés à une mission : ceux du même métier ou d'un métier voisin (filtre métier) ET tous ceux qui contiennent
 *   toutes les compétences obligatoires de la mission (option B) ;
 * - chaque CV retenu est comparé EN ENTIER à la fiche de poste par l'IA, critère par critère (atteint / partiel / non),
 *   avec une note sur 100 (option b) ; affichés : les profils notés 31 ou plus, du plus haut au plus bas ;
 * - seules les missions de la colonne Trello « Missions en cours » sont lues, et une seule fois : jamais recalculées,
 *   même modifiées ; elles gardent leurs profils quand elles passent chez un recruteur ;
 * - un nouveau CV est comparé à toutes les missions ouvertes déjà lues, s'il passe le filtre (3B) ;
 * - chaque note est gardée (empreinte mission + CV) : rien n'est jamais repayé.
 */
export const VERSION_MOTEUR_V4 = "2026-11-24.1-cv-complet";
export const COLONNE_A_LIRE = "Missions en cours";
const PAR_APPEL = 5;

export async function matchingV4Actif(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase.from("reglages").select("valeur").eq("cle", "matching_v4").maybeSingle();
  return data?.valeur === true;
}

type Note = { note: number; raison: string; detail: DetailIA };
const empreinte = (...parties: string[]) => createHash("md5").update(parties.join("|")).digest("hex");

/** Le CV contient-il toutes les compétences obligatoires de la mission (mot exact ou synonyme trouvé dans une expérience) ? */
export function contientObligatoires(l: LigneV3): boolean {
  const obligatoires = (l.exigences ?? []).filter((e) => Number(e.poids) >= 2);
  return obligatoires.length > 0 && obligatoires.every((e) => e.x === true);
}

/** CV comparés à la mission : filtre métier OU toutes les compétences obligatoires (option B). */
export function candidatsV4(lignes: LigneV3[], restreindre?: Set<string>): LigneV3[] {
  const ctx = contexteMission(lignes, { ...SEUILS_V3, metierEcart: REGLAGES_V3IA.ecartCandidats });
  return lignes.filter((l) => (!restreindre || restreindre.has(l.consultant_id)) && (l.metier_sim >= ctx.metierSeuil || contientObligatoires(l)));
}

/** Texte envoyé à l'IA : la fiche de poste (sans TJM) et la liste des critères à évaluer, dans l'ordre. */
async function texteMissionCriteres(supabase: SupabaseClient, missionId: string): Promise<string> {
  const [mission, { data: ex }] = await Promise.all([
    texteMissionIA(supabase, missionId),
    supabase.from("exigences_v3").select("type, ordre, libelle, poids").eq("mission_id", missionId).order("ordre"),
  ]);
  const criteres = (ex ?? []).map((e, i) => `${i + 1}. ${e.type === "metier" ? `Métier : ${e.libelle}` : e.libelle} (${e.type === "metier" || Number(e.poids) >= 2 ? "obligatoire" : "souhaité"})`);
  return `${mission}\n\nCRITÈRES À ÉVALUER, DANS CET ORDRE :\n${criteres.join("\n")}`;
}

function detailDepuis(n: NoteCriteres["notes"][number]): DetailIA {
  return {
    recapitulatif: n.raison.slice(0, 600),
    analyse: n.criteres.slice(0, 10).map((c) => ({ exigence: c.critere.slice(0, 120), atteint: c.niveau === "atteint", niveau: c.niveau, explication: c.preuve.slice(0, 300) })),
  };
}

/** Notes (CV complet ↔ fiche de poste) des CV donnés : celles déjà gardées sont reprises, les autres demandées à l'IA. */
async function noterCandidats(supabase: SupabaseClient, missionId: string, ids: string[], usages: UsageIA[]): Promise<{ notes: Map<string, Note>; manquants: number }> {
  const notes = new Map<string, Note>();
  if (!ids.length) return { notes, manquants: 0 };
  const mission = await texteMissionCriteres(supabase, missionId);
  const cleMission = empreinte(mission);
  const [{ data: dossiers }, { data: deja }] = await Promise.all([
    supabase.from("dossiers_cv").select("consultant_id, texte_hash").in("consultant_id", ids),
    supabase.from("notes_v3").select("consultant_id, empreinte, note, raison, detail").eq("mission_id", missionId).eq("etape", "cv"),
  ]);
  const cles = new Map((dossiers ?? []).map((d) => [d.consultant_id as string, empreinte(cleMission, d.texte_hash as string)]));
  for (const d of deja ?? []) if (cles.get(d.consultant_id) === d.empreinte) notes.set(d.consultant_id, { note: d.note, raison: d.raison ?? "", detail: d.detail as DetailIA });
  let aLire = ids.filter((id) => !notes.has(id) && cles.has(id));
  if (aLire.length && (await etatBudgetMois().catch(() => ({ depasse: true }))).depasse) return { notes, manquants: aLire.length };
  const textes = aLire.length ? await textesCV(supabase, aLire) : new Map<string, string>();
  aLire = aLire.filter((id) => textes.get(id));
  const lots = Array.from({ length: Math.ceil(aLire.length / PAR_APPEL) }, (_, i) => aLire.slice(i * PAR_APPEL, (i + 1) * PAR_APPEL));
  for (let i = 0; i < lots.length; i += 8) {
    await Promise.all(lots.slice(i, i + 8).map(async (lot) => {
      const texte = `${mission}\n\n${lot.map((id, k) => `===== C${k + 1} =====\n${textes.get(id)}`).join("\n\n")}`;
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
        console.error("Matching (CV complet) :", (e as Error).message);
      }
    }));
  }
  return { notes, manquants: ids.filter((id) => cles.has(id) && !notes.has(id)).length };
}

/** Lignes d'affichage des profils notés. */
async function lignesDepuisNotes(supabase: SupabaseClient, notes: Map<string, Note>, similarites: Map<string, number>): Promise<LigneClassement[]> {
  const ids = [...notes.keys()];
  if (!ids.length) return [];
  const fiches = await chargerCandidats(supabase, ids);
  const lignes: LigneClassement[] = fiches.map((c) => {
    const n = notes.get(c.consultant_id)!;
    return {
      consultant_id: c.consultant_id, prenom: c.prenom, nom: c.nom, trigramme: c.trigramme, telephone_e164: c.telephone_e164, email: c.email,
      intitule_poste: c.intitule_poste, disponibilite: c.disponibilite, disponible_le: c.disponible_le, pdf_anonyme_url: c.pdf_anonyme_url,
      word_url: c.word_url?.includes("sharepoint.com") ? c.word_url : null,
      annees_experience: c.annees_experience === null ? null : Number(c.annees_experience),
      resultat: { score: n.note, elimine: false, motifsElimination: [], raisons: [], alertes: [] },
      avisIA: { verdict: n.note >= 60 ? "pertinent" : n.note >= 40 ? "a_etudier" : "hors_sujet", raison: n.raison, note: n.note, detail: n.detail },
      similarite: similarites.get(c.consultant_id) ?? null, eligible: true,
    };
  });
  // CV Word rangé dans SharePoint pour les cartes affichées.
  const sansWord = lignes.filter((x) => !x.word_url).map((x) => x.consultant_id);
  if (sansWord.length) {
    const { data: docs } = await supabase.from("documents").select("consultant_id, url_web").in("consultant_id", sansWord).eq("type", "word_nominatif")
      .eq("supprime_sharepoint", false).ilike("url_web", "%sharepoint.com%").order("modifie_sharepoint_le", { ascending: false, nullsFirst: false });
    const par = new Map<string, string>();
    for (const d of docs ?? []) if (!par.has(d.consultant_id)) par.set(d.consultant_id, d.url_web);
    for (const x of lignes) x.word_url ??= par.get(x.consultant_id) ?? null;
  }
  return lignes;
}

const tri = (a: LigneClassement, b: LigneClassement) => (b.avisIA?.note ?? -1) - (a.avisIA?.note ?? -1) || (b.similarite ?? 0) - (a.similarite ?? 0);

/** Ce qui est rangé dans classements_mission pour une liste de profils notés. */
function rangement(lignes: LigneClassement[]) {
  const top = [...lignes].sort(tri);
  return {
    total: top.length, pertinents: top.filter(estPertinent).length, eligibles: null, top,
    ordre: top.map((l) => [l.consultant_id, Math.round(noteAffichee(l)), 1]),
    scores: Object.fromEntries(top.map((l) => [l.consultant_id, [noteAffichee(l), false]])),
  };
}

async function dernierCV(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase.from("dossiers_cv").select("updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  return (data?.updated_at as string | undefined) ?? new Date().toISOString();
}

/** Lecture complète d'une mission (une seule fois) : tous les CV qui passent le filtre, comparés en entier. */
export async function lireMissionV4(supabase: SupabaseClient, missionId: string): Promise<{ total: number; pertinents: number; manquants: number }> {
  const debut = Date.now();
  const verifiesLe = await dernierCV(supabase);
  if (!(await preparerMissionV3(supabase, missionId))) throw new Error("Mission sans métier ni exigence, ou service d'empreintes absent.");
  const { data, error } = await supabase.rpc("classement_v3", { p_mission: missionId });
  if (error) throw new Error(error.message);
  const candidats = candidatsV4((data ?? []) as LigneV3[]);
  const usages: UsageIA[] = [];
  try {
    const { notes, manquants } = await noterCandidats(supabase, missionId, candidats.map((l) => l.consultant_id), usages);
    // IA indisponible ou plafond du mois atteint avant toute note : l'ancien classement reste affiché.
    if (candidats.length && !notes.size) throw new Error("Plafond IA du mois atteint ou IA indisponible : classement précédent gardé.");
    const lignes = await lignesDepuisNotes(supabase, notes, new Map(candidats.map((l) => [l.consultant_id, l.metier_sim])));
    const r = rangement(lignes);
    await supabase.from("classements_mission").upsert({
      mission_id: missionId, ...r, calcule_le: new Date().toISOString(), duree_ms: Date.now() - debut, version: VERSION_MOTEUR_V4,
      // Notes manquantes (IA en panne pour un lot) : reprises au passage suivant, sans repayer les autres.
      a_recalculer: manquants > 0, en_calcul_depuis: null, erreur: null, cv_verifies_le: verifiesLe,
    });
    return { total: r.total, pertinents: r.pertinents, manquants };
  } finally {
    await enregistrerUsages(usages, `matching_v4:${missionId}`).catch(() => undefined);
  }
}

/** Nouveaux CV (découpés depuis la dernière vérification) comparés à une mission déjà lue ; ajoutés à ses profils. */
export async function comparerNouveauxCV(supabase: SupabaseClient, missionId: string, depuis: string): Promise<number> {
  const verifiesLe = await dernierCV(supabase);
  const { data: nouveaux } = await supabase.from("dossiers_cv").select("consultant_id").gt("updated_at", depuis);
  const ids = new Set((nouveaux ?? []).map((n) => n.consultant_id as string));
  if (!ids.size) {
    await supabase.from("classements_mission").update({ cv_verifies_le: verifiesLe }).eq("mission_id", missionId);
    return 0;
  }
  if (!(await preparerMissionV3(supabase, missionId))) return 0;
  const { data, error } = await supabase.rpc("classement_v3", { p_mission: missionId });
  if (error) throw new Error(error.message);
  const candidats = candidatsV4((data ?? []) as LigneV3[], ids);
  const usages: UsageIA[] = [];
  try {
    const { notes, manquants } = await noterCandidats(supabase, missionId, candidats.map((l) => l.consultant_id), usages);
    // Plafond atteint : on réessaiera plus tard (la date de vérification n'avance pas).
    if (manquants > 0 && !notes.size) return 0;
    const nouvelles = await lignesDepuisNotes(supabase, notes, new Map(candidats.map((l) => [l.consultant_id, l.metier_sim])));
    const { data: actuel } = await supabase.from("classements_mission").select("top").eq("mission_id", missionId).maybeSingle();
    const garde = ((actuel?.top ?? []) as LigneClassement[]).filter((l) => !notes.has(l.consultant_id));
    const r = rangement([...garde, ...nouvelles]);
    await supabase.from("classements_mission").update({ ...r, cv_verifies_le: manquants > 0 ? depuis : verifiesLe }).eq("mission_id", missionId);
    return nouvelles.length;
  } finally {
    await enregistrerUsages(usages, `matching_v4_nouveaux:${missionId}`).catch(() => undefined);
  }
}

/**
 * Décision 5B : les missions déjà chez les recruteurs gardent leurs profils, affichés à partir de 31 avec les notes déjà
 * calculées (« ancienne note »). Les anciens classements v3 rangeaient des notes plafonnées pour l'affichage (59 ou 55) :
 * ils sont reconstruits une fois avec les vraies notes gardées (CV complet, sinon résumé), sans aucun appel à l'IA.
 */
export async function reconstruireAnciennesNotes(supabase: SupabaseClient, missionId: string): Promise<number> {
  const { data } = await supabase.from("notes_v3").select("consultant_id, etape, note, raison, detail").eq("mission_id", missionId).in("etape", ["complet", "resume"]);
  const notes = new Map<string, Note>();
  for (const d of (data ?? []).sort((a, b) => (a.etape === "complet" ? 1 : 0) - (b.etape === "complet" ? 1 : 0))) {
    notes.set(d.consultant_id, { note: d.note, raison: d.raison ?? "", detail: (d.detail as DetailIA) ?? { recapitulatif: d.raison ?? "", analyse: [] } });
  }
  if (!notes.size) return 0;
  const lignes = await lignesDepuisNotes(supabase, notes, new Map());
  const r = rangement(lignes);
  await supabase.from("classements_mission").update({ ...r, a_recalculer: false }).eq("mission_id", missionId);
  return r.pertinents;
}
