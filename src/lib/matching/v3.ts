import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { envoyerLotExperiencesCV, lireLotExperiencesCV, type UsageIA } from "@/lib/ai";
import { enregistrerUsages, etatBudgetMois } from "@/lib/ai/journal";
import { MODELES } from "@/lib/ai/config";
import { motifSynonyme } from "./criteres";
import { empreintes, voyageConfigure } from "./empreintes";
import { chargerCandidats, type DetailIA, type LigneClassement } from "./classement";
import { anneesSansChevauchement, contexteMission, dateISO, dureeMois, noterV3, SEUILS_V3, texteExperience, texteDossier, type LigneV3, type SeuilsV3 } from "./v3-calcul";

/**
 * Matching v3 (23/11/2026) — « la base note tout, avec preuves ».
 * 1. Chaque CV est découpé UNE fois en expériences par l'IA (lot de nuit, moitié prix) : rôle, métier, dates, technologies.
 * 2. Chaque expérience a son empreinte de sens (Voyage AI, gratuit dans le quota).
 * 3. Pour une mission : son métier et ses exigences (déjà lus par l'IA à l'arrivée de la carte) reçoivent leur empreinte ;
 *    la base note TOUS les CV découpés (classement_v3) : même métier d'abord, puis chaque exigence avec l'expérience qui la prouve.
 * Aucune relecture payante des CV par mission. L'analyse approfondie par l'IA reste sur clic.
 */
export const VERSION_DECOUPAGE = "experiences-v1";
export const VERSION_MOTEUR_V3 = "2026-11-23.1-v3";

export async function matchingV3Actif(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase.from("reglages").select("valeur").eq("cle", "matching_v3").maybeSingle();
  return data?.valeur === true || data?.valeur === "true";
}

async function seuils(supabase: SupabaseClient): Promise<SeuilsV3> {
  const { data } = await supabase.from("reglages").select("valeur").eq("cle", "matching_v3_seuils").maybeSingle();
  return { ...SEUILS_V3, ...((data?.valeur ?? {}) as Partial<SeuilsV3>) };
}

// ---------------------------------------------------------------------------------------------------------------------
// 1. Découpage des CV (lot de nuit)
// ---------------------------------------------------------------------------------------------------------------------

interface EtatLot { id: string; envoye_le: string; nombre: number; textes: Record<string, { document_id: string; hash: string }> }

/**
 * Tâche de fond (toutes les 10 minutes) : envoie les CV nouveaux ou modifiés à découper (un lot à la fois), puis range
 * les résultats quand le lot est terminé. Ne dépense rien s'il n'y a pas de CV nouveau.
 */
export async function avancerDecoupage(supabase: SupabaseClient): Promise<{ etat: string; envoyes?: number; ranges?: number; enCours?: number }> {
  const { data: r } = await supabase.from("reglages").select("valeur").eq("cle", "lot_experiences_cv").maybeSingle();
  const lot = (r?.valeur ?? null) as EtatLot | null;
  if (lot?.id) {
    const etat = await lireLotExperiencesCV(lot.id);
    if (!etat.termine) return { etat: "lot en cours", enCours: etat.enCours };
    const usages: UsageIA[] = [];
    let ranges = 0;
    // Rangement en plusieurs passages si besoin (1 000 CV) : les CV déjà rangés depuis ce lot sont sautés.
    const fait = new Set<string>();
    for (let page = 0; ; page++) {
      const { data: d } = await supabase.from("dossiers_cv").select("consultant_id, texte_hash").range(page * 1000, page * 1000 + 999);
      for (const x of d ?? []) if (lot.textes[x.consultant_id]?.hash === x.texte_hash) fait.add(x.consultant_id as string);
      if ((d ?? []).length < 1000) break;
    }
    const debut = Date.now();
    let complet = true;
    for (const res of etat.resultats) {
      if (res.usage) usages.push(res.usage);
      const source = lot.textes[res.id];
      if (!source || fait.has(res.id)) continue;
      if (Date.now() - debut > 150_000) { complet = false; continue; }
      await rangerDecoupage(supabase, res.id, source.document_id, source.hash, res.donnees).then(() => ranges++)
        .catch((e) => console.error("Découpage :", (e as Error).message));
    }
    if (!complet) return { etat: "rangement en cours", ranges };
    // Lot terminé : effacé AVANT de compter son coût (un échec ne doit jamais faire compter le même lot deux fois).
    const { error: e } = await supabase.from("reglages").delete().eq("cle", "lot_experiences_cv");
    if (e) throw new Error(e.message);
    await enregistrerUsages(usages, `experiences_cv:${lot.id}`).catch(() => undefined);
    return { etat: "lot rangé", ranges };
  }
  if ((await etatBudgetMois().catch(() => ({ depasse: true }))).depasse) return { etat: "plafond IA atteint" };
  const { data: aFaire, error } = await supabase.rpc("cv_a_decouper", { p_limite: 2000 });
  if (error) throw new Error(error.message);
  const cv = (aFaire ?? []) as { consultant_id: string; document_id: string; texte: string; texte_hash: string }[];
  if (!cv.length) return { etat: "rien à découper" };
  const id = await envoyerLotExperiencesCV(cv.map((c) => ({ id: c.consultant_id, texte: c.texte })));
  const etat: EtatLot = { id, envoye_le: new Date().toISOString(), nombre: cv.length, textes: Object.fromEntries(cv.map((c) => [c.consultant_id, { document_id: c.document_id, hash: c.texte_hash }])) };
  await supabase.from("reglages").upsert({ cle: "lot_experiences_cv", valeur: etat });
  return { etat: "lot envoyé", envoyes: cv.length };
}

/** Range le parcours d'un CV : dossier (métier réel) et expériences ; empreintes calculées ensuite. */
export async function rangerDecoupage(supabase: SupabaseClient, consultantId: string, documentId: string, hash: string,
  d: { metier_principal: string; metiers: string[]; experiences: { role: string; metier: string; entreprise: string | null; debut: string | null; fin: string | null; technologies: string[]; responsabilites: string }[] } | null): Promise<void> {
  const experiences = (d?.experiences ?? []).slice(0, 20).map((x, i) => {
    const debut = dateISO(x.debut), fin = dateISO(x.fin);
    const e = { role: x.role.slice(0, 200), metier: x.metier.slice(0, 120), entreprise: x.entreprise?.slice(0, 160) ?? null, technologies: x.technologies.slice(0, 15).map((t) => t.slice(0, 60)), responsabilites: x.responsabilites.slice(0, 600) };
    return { consultant_id: consultantId, ordre: i, ...e, debut, fin, duree_mois: dureeMois(debut, fin), texte: texteExperience(e) };
  });
  await supabase.from("experiences_cv").delete().eq("consultant_id", consultantId);
  if (experiences.length) {
    const { error } = await supabase.from("experiences_cv").insert(experiences);
    if (error) throw new Error(error.message);
  }
  const { error } = await supabase.from("dossiers_cv").upsert({
    consultant_id: consultantId, document_id: documentId, texte_hash: hash, metier_principal: d?.metier_principal?.slice(0, 120) ?? "Inconnu",
    metiers: (d?.metiers ?? []).slice(0, 3), annees_total: anneesSansChevauchement(experiences), empreinte: null,
    modele: MODELES.experiencesCV, version: VERSION_DECOUPAGE, updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

/** Empreintes de sens des expériences et dossiers qui n'en ont pas encore (gratuit dans le quota Voyage), dans le temps imparti. */
export async function empreintesV3(supabase: SupabaseClient, budgetMs = 60_000): Promise<{ calculees: number; restantes: boolean }> {
  if (!voyageConfigure()) return { calculees: 0, restantes: false };
  const debut = Date.now();
  let calculees = 0, jetons = 0;
  try {
    for (;;) {
      if (Date.now() - debut > budgetMs) return { calculees, restantes: true };
      const { data: xs } = await supabase.from("experiences_cv").select("id, texte").is("empreinte", null).limit(120);
      const lot = xs ?? [];
      if (!lot.length) break;
      const r = await empreintes(lot.map((x) => x.texte as string), "document");
      jetons += r.jetons;
      await Promise.all(lot.map((x, i) => supabase.from("experiences_cv").update({ empreinte: `[${r.vecteurs[i].join(",")}]` }).eq("id", x.id)));
      calculees += lot.length;
    }
    for (;;) {
      if (Date.now() - debut > budgetMs) return { calculees, restantes: true };
      const { data: ds } = await supabase.from("dossiers_cv").select("consultant_id, metier_principal, metiers").is("empreinte", null).limit(60);
      const lot = ds ?? [];
      if (!lot.length) break;
      const ids = lot.map((d) => d.consultant_id as string);
      const { data: xs } = await supabase.from("experiences_cv").select("consultant_id, role, metier, debut, fin").in("consultant_id", ids).order("ordre");
      const parConsultant = new Map<string, { role: string; metier: string | null; debut: string | null; fin: string | null }[]>();
      for (const x of xs ?? []) parConsultant.set(x.consultant_id, [...(parConsultant.get(x.consultant_id) ?? []), x]);
      const r = await empreintes(lot.map((d) => texteDossier(d.metier_principal, d.metiers ?? [], parConsultant.get(d.consultant_id) ?? [])), "document");
      jetons += r.jetons;
      await Promise.all(lot.map((d, i) => supabase.from("dossiers_cv").update({ empreinte: `[${r.vecteurs[i].join(",")}]` }).eq("consultant_id", d.consultant_id)));
      calculees += lot.length;
    }
    return { calculees, restantes: false };
  } finally {
    if (jetons) await enregistrerUsages([{ usage: "empreintes", modele: "voyage-4-large", mode: "standard", tokens_entree: jetons, tokens_sortie: 0, tokens_cache_lecture: 0, tokens_cache_ecriture: 0, cout_estime_usd: 0 }], "empreintes:v3").catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// 2. Mission : métier et exigences avec leur empreinte (sans nouvel appel à l'IA payante)
// ---------------------------------------------------------------------------------------------------------------------

interface ElementMission { type: "metier" | "exigence"; ordre: number; libelle: string; poids: number; motifs: string[]; texte: string }

/** Métier et exigences d'une mission, tirés de ce que l'IA a déjà lu (critères obligatoires, compétences, souhaits). */
export async function elementsMission(supabase: SupabaseClient, missionId: string): Promise<ElementMission[]> {
  const { data: m } = await supabase.from("missions")
    .select("intitule, texte_besoin, criteres_matching, mission_competences(obligatoire, importance, competences(nom_canonique))").eq("id", missionId).maybeSingle();
  if (!m) return [];
  const c = (m.criteres_matching ?? null) as { metier?: { libelle: string; synonymes: string[] }; obligatoires?: { critere: string; synonymes: string[] }[]; souhaites?: string[] } | null;
  const motifs = (mots: string[]) => [...new Set(mots.map(motifSynonyme).filter((x): x is string => !!x))].slice(0, 12);
  const metierLib = c?.metier?.libelle || m.intitule;
  const elements: ElementMission[] = [{
    type: "metier", ordre: 0, libelle: metierLib, poids: 1, motifs: [],
    texte: [`Poste : ${m.intitule}`, `Métier : ${metierLib}${c?.metier?.synonymes?.length ? ` (${c.metier.synonymes.slice(0, 6).join(", ")})` : ""}`, (m.texte_besoin ?? "").slice(0, 1200)].filter(Boolean).join("\n"),
  }];
  const vus = new Set<string>();
  const cle = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const ajouter = (libelle: string, synonymes: string[], poids: number) => {
    const k = cle(libelle);
    if (!k || vus.has(k) || elements.length > 8) return;
    vus.add(k);
    const syn = [...new Set([libelle, ...synonymes])];
    elements.push({ type: "exigence", ordre: elements.length, libelle: libelle.slice(0, 120), poids, motifs: motifs(syn), texte: `Expérience réelle de ${libelle}${syn.length > 1 ? ` (${syn.slice(1, 6).join(", ")})` : ""}` });
  };
  for (const o of c?.obligatoires ?? []) ajouter(o.critere, o.synonymes ?? [], 3);
  const comps = ((m.mission_competences ?? []) as unknown as { obligatoire: boolean; importance: number; competences: { nom_canonique: string } | null }[])
    .filter((x) => x.competences?.nom_canonique).sort((a, b) => Number(b.obligatoire) - Number(a.obligatoire) || b.importance - a.importance);
  for (const x of comps.filter((x) => x.obligatoire)) ajouter(x.competences!.nom_canonique, [], 2);
  for (const s of (c?.souhaites ?? []).slice(0, 4)) ajouter(s, [], 1);
  for (const x of comps.filter((x) => !x.obligatoire)) ajouter(x.competences!.nom_canonique, [], 1);
  return elements;
}

/** Range le métier et les exigences de la mission avec leur empreinte, seulement si quelque chose a changé. */
export async function preparerMissionV3(supabase: SupabaseClient, missionId: string): Promise<boolean> {
  const elements = await elementsMission(supabase, missionId);
  if (!elements.length || !voyageConfigure()) return false;
  const hash = createHash("md5").update(JSON.stringify(elements)).digest("hex");
  const { data: deja } = await supabase.from("exigences_v3").select("source_hash").eq("mission_id", missionId).limit(1).maybeSingle();
  if (deja?.source_hash === hash) return true;
  const r = await empreintes(elements.map((e) => e.texte), "query");
  await supabase.from("exigences_v3").delete().eq("mission_id", missionId);
  const { error } = await supabase.from("exigences_v3").insert(elements.map((e, i) => ({ mission_id: missionId, ...e, empreinte: `[${r.vecteurs[i].join(",")}]`, source_hash: hash })));
  if (error) throw new Error(error.message);
  return true;
}

// ---------------------------------------------------------------------------------------------------------------------
// 3. Classement : toute la base notée, avec preuves
// ---------------------------------------------------------------------------------------------------------------------

/** Identifiants des premiers profils v3 d'une mission (sans charger les fiches) : vérification de la qualité. */
export async function premiersV3(supabase: SupabaseClient, missionId: string, nombre = 20): Promise<string[]> {
  if (!(await preparerMissionV3(supabase, missionId))) return [];
  const [{ data: m }, { data }, s] = await Promise.all([
    supabase.from("missions").select("annees_min").eq("id", missionId).maybeSingle(),
    supabase.rpc("classement_v3", { p_mission: missionId }),
    seuils(supabase),
  ]);
  const lignes = (data ?? []) as LigneV3[];
  const ctx = contexteMission(lignes, s);
  return lignes.map((l) => ({ id: l.consultant_id, n: noterV3(l, Number(m?.annees_min ?? 0) || null, s, ctx) }))
    .filter((x) => x.n.memeMetier).sort((a, b) => b.n.note - a.n.note).slice(0, nombre).map((x) => x.id);
}

/** Classement v3 d'une mission : tous les CV découpés, notés par la base ; les autres métiers sont écartés d'office. */
export async function classerMissionV3(supabase: SupabaseClient, missionId: string): Promise<LigneClassement[]> {
  if (!(await preparerMissionV3(supabase, missionId))) throw new Error("Mission sans métier ni exigence, ou service d'empreintes absent.");
  const [{ data: m }, { data, error }, s] = await Promise.all([
    supabase.from("missions").select("annees_min").eq("id", missionId).maybeSingle(),
    supabase.rpc("classement_v3", { p_mission: missionId }),
    seuils(supabase),
  ]);
  if (error) throw new Error(error.message);
  const lignes = (data ?? []) as LigneV3[];
  const ctx = contexteMission(lignes, s);
  const notes = lignes.map((l) => ({ l, n: noterV3(l, Number(m?.annees_min ?? 0) || null, s, ctx) }));
  const ids = notes.map((x) => x.l.consultant_id);
  const fiches = new Map((await chargerCandidats(supabase, ids)).map((c) => [c.consultant_id, c]));
  const resultat: LigneClassement[] = [];
  for (const { l, n } of notes) {
    const c = fiches.get(l.consultant_id);
    if (!c) continue;
    const detail: DetailIA = { recapitulatif: n.recapitulatif, analyse: n.analyse };
    resultat.push({
      consultant_id: c.consultant_id, prenom: c.prenom, nom: c.nom, trigramme: c.trigramme, telephone_e164: c.telephone_e164, email: c.email,
      intitule_poste: c.intitule_poste, disponibilite: c.disponibilite, disponible_le: c.disponible_le, pdf_anonyme_url: c.pdf_anonyme_url,
      word_url: c.word_url?.includes("sharepoint.com") ? c.word_url : null,
      annees_experience: c.annees_experience === null ? null : Number(c.annees_experience),
      resultat: { score: n.note, elimine: !n.memeMetier, motifsElimination: n.memeMetier ? [] : [`Autre métier : ${l.metier_role ?? "non déterminé"}`], raisons: [], alertes: [] },
      avisIA: { verdict: n.note >= 60 ? "pertinent" : n.note >= 40 ? "a_etudier" : "hors_sujet", raison: n.raison, note: n.note, detail },
      similarite: l.metier_sim, eligible: n.memeMetier,
    });
  }
  // CV Word rangé dans SharePoint pour les cartes affichées (comme le classement précédent).
  const premiers = resultat.filter((x) => !x.resultat.elimine).sort((a, b) => b.resultat.score - a.resultat.score);
  const sansWord = premiers.slice(0, 60).filter((x) => !x.word_url).map((x) => x.consultant_id);
  if (sansWord.length) {
    const { data: docs } = await supabase.from("documents").select("consultant_id, url_web").in("consultant_id", sansWord).eq("type", "word_nominatif")
      .eq("supprime_sharepoint", false).ilike("url_web", "%sharepoint.com%").order("modifie_sharepoint_le", { ascending: false, nullsFirst: false });
    const par = new Map<string, string>();
    for (const d of docs ?? []) if (!par.has(d.consultant_id)) par.set(d.consultant_id, d.url_web);
    for (const x of resultat) x.word_url ??= par.get(x.consultant_id) ?? null;
  }
  return [...premiers, ...resultat.filter((x) => x.resultat.elimine).sort((a, b) => b.resultat.score - a.resultat.score)];
}
