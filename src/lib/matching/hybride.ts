import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { noterCandidats, noterCV, type UsageIA } from "@/lib/ai";
import { enregistrerUsages, etatBudgetMois } from "@/lib/ai/journal";
import { classementMission, type DetailIA, type LigneClassement } from "./classement";
import { assurerEmpreinteMission, texteMission } from "./empreintes";
import { criteresDeLaMission, criteresManquants, motifsCriteres, profilsEligibles, type CriteresMission } from "./criteres";

/**
 * Matching (méthode du 17/11/2026), en trois temps :
 * 1. Présélection combinée : les profils les plus proches de la mission par le SENS (empreintes Voyage AI) et ceux qui ont
 *    les compétences demandées (MOTS exacts) sont fusionnés par « fusion des rangs » (méthode standard des moteurs de
 *    recherche : un profil bien placé dans l'une ou l'autre liste remonte).
 * 2. Décision par l'IA : elle lit la mission entière et les 100 premiers profils (sans nom ni coordonnées) et donne à chacun
 *    une note sur 100 avec une raison. Chaque note est gardée tant que la mission ne change pas : seuls les nouveaux
 *    entrants sont lus (coût maîtrisé).
 * 3. Apprentissage : les décisions de l'équipe (appelé, envoyé au client, retenu, refusé) sont données à l'IA en exemples.
 * Les filtres éliminatoires (compétences indispensables) restent appliqués ; le score est une aide, jamais un refus.
 */
export const PROFILS_LUS_PAR_IA = 100;
const PAR_APPEL_IA = 25;
/** Profils retenus par le sens avant fusion. */
const PROCHES = 250;
/** Constante de la fusion des rangs (valeur usuelle). */
const K_FUSION = 60;
/** Version des consignes de notation : la changer fait relire tous les profils. */
const VERSION_NOTE = "note-v1";
/** Matching v2 : profils éligibles dont l'IA lit le CV complet, et nombre de CV par appel. */
export const CV_LUS_PAR_IA = 60;
const CV_PAR_APPEL = 3;
const VERSION_NOTE_CV = "note-cv-v5";
/** Profils « proches » (ne remplissent pas tous les critères) montrés à part, avec ce qui leur manque. */
const PROCHES_MONTRES = 15;

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
export async function classerMission(supabase: SupabaseClient, missionId: string, options: { v2?: boolean; enregistrerAvis?: boolean } = {}): Promise<LigneClassement[]> {
  const v2 = options.v2 ?? false;
  const mission = await chargerMission(supabase, missionId);
  if (!mission) return [];

  // 1. Proches par le sens (si les empreintes sont disponibles ; sinon, compétences seules).
  const texteEmpreinte = texteMission({ intitule: mission.intitule, texte_besoin: mission.texte_besoin, competences: mission.competences.map((c) => c.nom) });
  const avecSens = await assurerEmpreinteMission(supabase, missionId, texteEmpreinte).catch((e) => { console.error("Empreinte mission :", (e as Error).message); return false; });
  const { data: proches } = avecSens ? await supabase.rpc("proches_mission", { p_mission_id: missionId, p_nombre: PROCHES }) : { data: [] };
  const rangSens = new Map(((proches ?? []) as { consultant_id: string; similarite: number }[]).map((p, i) => [p.consultant_id, { rang: i + 1, similarite: p.similarite }]));

  // 2. Critères de la mission (métier + critères obligatoires) et profils éligibles : la BASE cherche dans le texte complet des CV.
  const texteIA = [
    `Poste : ${mission.intitule}`, mission.client && `Client : ${mission.client}`, mission.localisation && `Lieu : ${mission.localisation}`,
    mission.competences.length && `Compétences demandées : ${mission.competences.map((c) => `${c.nom}${c.obligatoire ? " (indispensable)" : ""}`).join(", ")}`,
    `Description :\n${mission.texte_besoin ?? ""}`,
  ].filter(Boolean).join("\n");
  // Matching v2 seulement (sinon, ancienne méthode : présélection puis lecture des résumés par l'IA).
  const criteres = v2 ? await criteresDeLaMission(supabase, missionId, texteIA) : null;
  const groupes = criteres ? motifsCriteres(criteres) : [];
  // Filtre strict = critères obligatoires seulement (19/11/2026). Le métier n'élimine plus : un CV le nomme de mille façons
  // (« Full-Stack », « Ingénieur études et développement », « Tech Lead »…) ; il sert à placer en tête ceux qui le nomment,
  // et l'IA vérifie le vrai métier en lisant le CV complet. Sans critère obligatoire, le métier sert de filtre.
  const filtre = groupes.length > 1 ? groupes.slice(1) : groupes;
  const eligibles = filtre.length ? await profilsEligibles(supabase, filtre.map((g) => g.motif)).catch((e) => { console.error((e as Error).message); return null; }) : null;
  const avecMetier = groupes.length > 1 && eligibles ? await profilsEligibles(supabase, groupes.map((g) => g.motif)).catch(() => new Set<string>()) : new Set<string>();

  // 3. Score explicable de tous les profils (compétences exactes), y compris ceux trouvés par le sens et par les critères.
  const lignes = await classementMission(supabase, missionId, 100_000, [...rangSens.keys(), ...(eligibles ?? [])]);
  const estEligible = (id: string) => (eligibles ? eligibles.has(id) : true);
  for (const l of lignes) { l.similarite = rangSens.get(l.consultant_id)?.similarite ?? null; l.eligible = estEligible(l.consultant_id); }
  const nonEcartes = lignes.filter((l) => !l.resultat.elimine);
  const rangMots = new Map(nonEcartes.map((l, i) => [l.consultant_id, i + 1]));
  const fusion = (id: string) => (rangMots.has(id) ? 1 / (K_FUSION + rangMots.get(id)!) : 0) + (rangSens.has(id) ? 1 / (K_FUSION + rangSens.get(id)!.rang) : 0);
  const parFusion = [...nonEcartes].sort((a, b) => fusion(b.consultant_id) - fusion(a.consultant_id));
  const ordre = new Map(parFusion.map((l, i) => [l.consultant_id, i]));

  // 4. L'IA départage : CV complet des 30 premiers éligibles (v2), ou, sans critères lisibles, l'ancienne lecture des résumés.
  const empreinte = createHash("sha256").update(`${texteIA}|${eligibles ? `${VERSION_NOTE_CV}|${JSON.stringify(criteres)}` : VERSION_NOTE}`).digest("hex").slice(0, 32);
  const notes = eligibles
    ? await notesCV(supabase, missionId, texteIA, criteres!, empreinte,
        // Profils qui nomment aussi le métier d'abord, puis les autres éligibles, dans l'ordre de la présélection.
        [...parFusion.filter((l) => l.eligible && avecMetier.has(l.consultant_id)), ...parFusion.filter((l) => l.eligible && !avecMetier.has(l.consultant_id))].slice(0, CV_LUS_PAR_IA),
        options.enregistrerAvis ?? true)
    : await notesIA(supabase, missionId, texteIA, empreinte, parFusion.slice(0, PROFILS_LUS_PAR_IA));

  // 5. Profils proches (pas tous les critères) : montrés à part, avec ce qui leur manque, jamais notés comme pertinents.
  if (eligibles) {
    const proches = parFusion.filter((l) => !l.eligible).slice(0, PROCHES_MONTRES);
    const manques = await criteresManquants(supabase, groupes, proches.map((l) => l.consultant_id)).catch(() => new Map<string, string[]>());
    for (const l of proches) l.manques = manques.get(l.consultant_id) ?? [];
  }

  // Ordre final : éligibles notés (meilleure note d'abord), autres éligibles, profils proches, le reste, puis les écartés.
  const avecAvis = lignes.map((l) => {
    const n = notes.get(l.consultant_id);
    return { ...l, avisIA: n ? { verdict: verdictDeNote(n.note), raison: n.raison, note: n.note, detail: (n as { detail?: DetailIA | null }).detail ?? null } : null };
  });
  const groupe = (l: LigneClassement) => (l.resultat.elimine ? 4 : !l.eligible ? (l.manques ? 2 : 3) : l.avisIA ? 0 : 1);
  return avecAvis.sort((a, b) => groupe(a) - groupe(b)
    || (b.avisIA?.note ?? 0) - (a.avisIA?.note ?? 0)
    || (ordre.get(a.consultant_id) ?? 1e9) - (ordre.get(b.consultant_id) ?? 1e9)
    || b.resultat.score - a.resultat.score);
}

/** Matching v2 : notes de l'IA en lisant le CV COMPLET des profils éligibles (5 par appel), gardées tant que la mission et ses critères ne changent pas. */
async function notesCV(supabase: SupabaseClient, missionId: string, texteIA: string, criteres: CriteresMission, empreinte: string, aLire: LigneClassement[], enregistrer = true): Promise<Map<string, { note: number; raison: string | null; detail?: DetailIA | null }>> {
  const ids = aLire.map((l) => l.consultant_id);
  const notes = new Map<string, { note: number; raison: string | null; detail?: DetailIA | null }>();
  if (!ids.length) return notes;
  const { data: existants } = await supabase.from("avis_matching").select("consultant_id, note, raison, empreinte, detail").eq("mission_id", missionId).in("consultant_id", ids);
  for (const a of existants ?? []) if (a.empreinte === empreinte && a.note != null) notes.set(a.consultant_id, { note: a.note, raison: a.raison, detail: (a.detail as DetailIA | null) ?? null });
  const manquants = aLire.filter((l) => !notes.has(l.consultant_id));
  if (!manquants.length || (await etatBudgetMois().catch(() => ({ depasse: true }))).depasse) return notes;
  const cv = await textesCV(supabase, manquants);
  const exemples = await exemplesEquipe(supabase, missionId);
  const texteCriteres = [`Métier : ${criteres.metier.libelle}`, ...criteres.obligatoires.map((o) => `Obligatoire : ${o.critere} (${o.synonymes.slice(0, 6).join(", ")})`),
    criteres.souhaites.length ? `Souhaité : ${criteres.souhaites.join(", ")}` : ""].filter(Boolean).join("\n");
  const usages: UsageIA[] = [];
  try {
    const lots = Array.from({ length: Math.ceil(manquants.length / CV_PAR_APPEL) }, (_, i) => manquants.slice(i * CV_PAR_APPEL, (i + 1) * CV_PAR_APPEL));
    await Promise.all(lots.map(async (lot) => {
      // CV envoyés sans nom ni coordonnées : référence C1, C2…
      const refs = lot.map((l, i) => ({ ref: `C${i + 1}`, id: l.consultant_id, texte: cv.get(l.consultant_id) ?? `Titre : ${l.intitule_poste ?? "non renseigné"}` }));
      try {
        const r = await noterCV(texteIA, texteCriteres, refs.map(({ ref, texte }) => ({ ref, texte })), exemples);
        usages.push(...r.usages);
        const numero = (ref: string) => ref.match(/(\d+)/)?.[1];
        const parNumero = new Map(refs.map((x) => [numero(x.ref)!, x.id]));
        const lignesAvis = r.donnees.notes.map((a) => ({ a, id: parNumero.get(numero(a.ref) ?? "") })).filter((x) => x.id).map(({ a, id }) => {
          // Règle appliquée par l'outil, pas laissée à l'IA : un critère obligatoire non prouvé = jamais « pertinent » (45 au plus).
          const note = Math.max(0, Math.min(a.criteres_prouves ? 100 : 45, Math.round(a.note)));
          const detail: DetailIA = { recapitulatif: a.recapitulatif.slice(0, 1500), analyse: a.analyse.slice(0, 10).map((x) => ({ exigence: x.exigence.slice(0, 120), atteint: x.atteint, explication: x.explication.slice(0, 400) })) };
          return { mission_id: missionId, consultant_id: id!, empreinte, note, verdict: verdictDeNote(note), raison: a.raison.slice(0, 300), detail, modele: r.modele, updated_at: new Date().toISOString() };
        });
        // Profil sans réponse de l'IA (réponse coupée, référence oubliée) : PAS noté 0 ; il sera relu au prochain calcul.
        // Aperçu (matching v2 pas encore activé) : notes non enregistrées, pour ne pas remplacer celles du classement affiché.
        if (lignesAvis.length && enregistrer) await supabase.from("avis_matching").upsert(lignesAvis);
        for (const l of lignesAvis) notes.set(l.consultant_id, { note: l.note, raison: l.raison, detail: l.detail });
      } catch (e) {
        usages.push(...((e as { usages?: UsageIA[] }).usages ?? []));
        console.error("Notes IA (CV) :", (e as Error).message);
      }
    }));
  } finally {
    await enregistrerUsages(usages, `matching:${missionId}`).catch(() => {});
  }
  return notes;
}

/** CV complet de chaque profil (Word nominatif le plus récent), sinon le texte connu (ligne de l'Excel, poste, notes). */
async function textesCV(supabase: SupabaseClient, lignes: LigneClassement[]): Promise<Map<string, string>> {
  const ids = lignes.map((l) => l.consultant_id);
  const [{ data: docs }, { data: textes }] = await Promise.all([
    supabase.from("documents").select("consultant_id, texte_extrait, modifie_sharepoint_le").in("consultant_id", ids).eq("type", "word_nominatif").eq("supprime_sharepoint", false).not("texte_extrait", "is", null),
    supabase.from("textes_consultants").select("consultant_id, texte").in("consultant_id", ids),
  ]);
  const cv = new Map<string, { t: string; d: string }>();
  for (const d of (docs ?? []) as { consultant_id: string; texte_extrait: string; modifie_sharepoint_le: string | null }[]) {
    const deja = cv.get(d.consultant_id);
    if (!deja || String(d.modifie_sharepoint_le ?? "") > deja.d) cv.set(d.consultant_id, { t: d.texte_extrait, d: String(d.modifie_sharepoint_le ?? "") });
  }
  const autres = new Map((textes ?? []).map((t) => [t.consultant_id as string, String(t.texte ?? "")]));
  return new Map(lignes.map((l) => {
    const corps = cv.get(l.consultant_id)?.t ?? autres.get(l.consultant_id) ?? "";
    return [l.consultant_id, `Titre : ${l.intitule_poste ?? "non renseigné"}${l.annees_experience ? ` · ${l.annees_experience} ans d'expérience` : ""}\n${corps.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").slice(0, 9000)}`];
  }));
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
        // Référence relue avec souplesse (« C3 », « [C3] », « c3 »…) : une réponse n'est jamais perdue pour une question d'écriture.
        const numero = (ref: string) => ref.match(/(\d+)/)?.[1];
        const parNumero = new Map(refs.map((x) => [numero(x.ref)!, x.id]));
        const lignesAvis = r.donnees.notes.map((a) => ({ a, id: parNumero.get(numero(a.ref) ?? "") })).filter((x) => x.id).map(({ a, id }) => {
          const note = Math.max(0, Math.min(100, Math.round(a.note)));
          return { mission_id: missionId, consultant_id: id!, empreinte, note, verdict: verdictDeNote(note), raison: a.raison.slice(0, 300), modele: r.modele, updated_at: new Date().toISOString() };
        });
        // Profil lu mais sans note dans la réponse : l'IA ne l'a pas retenu. Noté 0 (jamais affiché) et pas renvoyé à chaque calcul.
        const notees = new Set(lignesAvis.map((l) => l.consultant_id));
        for (const x of refs) if (!notees.has(x.id)) lignesAvis.push({ mission_id: missionId, consultant_id: x.id, empreinte, note: 0, verdict: "hors_sujet", raison: "Non retenu par l'IA pour cette mission.", modele: r.modele, updated_at: new Date().toISOString() });
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
