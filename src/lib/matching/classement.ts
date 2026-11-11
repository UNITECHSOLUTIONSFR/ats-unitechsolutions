import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PONDERATIONS_PAR_DEFAUT,
  classer,
  scorerConsultant,
  type ExigenceCompetence,
  type MissionAScorer,
  type Ponderations,
  type ResultatScore,
  type Seniorite,
} from "./score";
import { motifCompetence } from "./motifs";
import { famillesDansTexte } from "./referentiel";

export interface LigneClassement {
  consultant_id: string;
  prenom: string;
  nom: string;
  trigramme: string;
  telephone_e164: string | null;
  email: string | null;
  intitule_poste: string | null;
  disponibilite: string | null;
  disponible_le: string | null;
  pdf_anonyme_url: string | null;
  word_url: string | null;
  annees_experience: number | null;
  resultat: ResultatScore;
}

interface LigneCandidat {
  consultant_id: string;
  prenom: string;
  nom: string;
  trigramme: string;
  telephone_e164: string | null;
  email: string | null;
  intitule_poste: string | null;
  disponibilite: string | null;
  disponible_le: string | null;
  disponibilite_maj_le: string | null;
  localisation: string | null;
  annees_experience: number | null;
  seniorite: Seniorite | null;
  competences: { competence_id: string; annees: number | null }[];
  similarite: number | null;
  pdf_anonyme_url: string | null;
  word_url: string | null;
}

/** Charge la mission et ses exigences sous la forme attendue par le calcul du score. */
export async function chargerMissionAScorer(supabase: SupabaseClient, missionId: string): Promise<MissionAScorer | null> {
  const { data: m } = await supabase
    .from("missions")
    .select("id, annees_min, seniorite, date_debut, localisation, exigences, mission_competences(competence_id, obligatoire, importance, annees_min, competences(nom_canonique))")
    .eq("id", missionId)
    .maybeSingle();
  if (!m) return null;
  const options = (m.exigences ?? {}) as { disponibilite_obligatoire?: boolean; localisation_obligatoire?: boolean };
  const competences: ExigenceCompetence[] = (m.mission_competences ?? []).map(
    (mc: { competence_id: string; obligatoire: boolean; importance: number; annees_min: number | null; competences: unknown }) => ({
      competence_id: mc.competence_id,
      nom: (mc.competences as { nom_canonique: string } | null)?.nom_canonique ?? "?",
      obligatoire: mc.obligatoire,
      importance: Math.min(3, Math.max(1, mc.importance)) as 1 | 2 | 3,
      annees_min: mc.annees_min === null ? null : Number(mc.annees_min),
    }),
  );
  // Technologie citée dans l'intitulé (« Développeur .NET ») : compte comme une compétence essentielle, même oubliée à la lecture.
  const { data: intitule } = await supabase.from("missions").select("intitule").eq("id", missionId).maybeSingle();
  for (const famille of famillesDansTexte(intitule?.intitule ?? "")) {
    if (competences.some((c) => c.nom.toLowerCase() === famille.toLowerCase())) continue;
    const { data: k } = await supabase.from("competences").select("id, nom_canonique").eq("nom_canonique", famille).maybeSingle();
    if (k && !competences.some((c) => c.competence_id === k.id)) competences.push({ competence_id: k.id, nom: k.nom_canonique, obligatoire: false, importance: 3, annees_min: null });
  }
  return {
    competences,
    annees_min: m.annees_min === null ? null : Number(m.annees_min),
    seniorite: m.seniorite,
    date_debut: m.date_debut,
    localisation: m.localisation,
    disponibilite_obligatoire: !!options.disponibilite_obligatoire,
    localisation_obligatoire: !!options.localisation_obligatoire,
  };
}

export async function ponderationsReglees(supabase: SupabaseClient): Promise<Ponderations> {
  const { data } = await supabase.from("reglages").select("valeur").eq("cle", "ponderations_score").maybeSingle();
  return { ...PONDERATIONS_PAR_DEFAUT, ...((data?.valeur as Partial<Ponderations>) ?? {}) };
}

/** Classement des consultants pour une mission : filtres, score, raisons. Aucun appel à l'IA. */
export async function classementMission(supabase: SupabaseClient, missionId: string, limite = 50): Promise<LigneClassement[]> {
  const mission = await chargerMissionAScorer(supabase, missionId);
  if (!mission) return [];
  const [ponderations, { data, error }, dansLesTextes] = await Promise.all([
    ponderationsReglees(supabase),
    supabase.rpc("candidats_mission", { p_mission_id: missionId }),
    competencesDansLesTextes(supabase, mission.competences.map((e) => e.competence_id)),
  ]);
  if (error) throw new Error(error.message);
  // Personnes dont le CV ou la ligne Excel cite une compétence demandée, sans fiche analysée : ajoutées au classement.
  const connus = new Set(((data ?? []) as LigneCandidat[]).map((c) => c.consultant_id));
  const absents = [...dansLesTextes.keys()].filter((id) => !connus.has(id));
  const supplementaires = absents.length ? await chargerCandidats(supabase, absents) : [];
  const lignes = [...((data ?? []) as LigneCandidat[]), ...supplementaires].map((c) => ({
    consultant_id: c.consultant_id,
    prenom: c.prenom,
    nom: c.nom,
    trigramme: c.trigramme,
    telephone_e164: c.telephone_e164,
    email: c.email,
    intitule_poste: c.intitule_poste,
    disponibilite: c.disponibilite,
    disponible_le: c.disponible_le,
    pdf_anonyme_url: c.pdf_anonyme_url,
    // CV reçus par l'ancien groupe recrutement@ : le lien vers la messagerie ne mène nulle part, seul un fichier SharePoint est proposé.
    word_url: c.word_url?.includes("sharepoint.com") ? c.word_url : null,
    annees_experience: c.annees_experience === null ? null : Number(c.annees_experience),
    resultat: scorerConsultant(mission, {
      competences: avecTextes(c.competences.map((x) => ({ competence_id: x.competence_id, annees: x.annees === null ? null : Number(x.annees) })), dansLesTextes.get(c.consultant_id)),
      annees_experience: c.annees_experience === null ? null : Number(c.annees_experience),
      seniorite: c.seniorite,
      disponible_le: c.disponible_le,
      disponibilite: c.disponibilite,
      disponibilite_maj_le: c.disponibilite_maj_le,
      localisation: c.localisation,
      similarite: c.similarite,
    }, ponderations),
  }));
  const retenus = classer(lignes).slice(0, limite);
  // Lien Outlook écarté : on cherche alors un CV Word rangé dans SharePoint pour la même personne.
  const sansWord = retenus.filter((l) => !l.word_url).map((l) => l.consultant_id);
  if (sansWord.length) {
    const { data: docs } = await supabase.from("documents").select("consultant_id, url_web")
      .in("consultant_id", sansWord).eq("type", "word_nominatif").eq("supprime_sharepoint", false)
      .ilike("url_web", "%sharepoint.com%").order("modifie_sharepoint_le", { ascending: false, nullsFirst: false });
    const parConsultant = new Map<string, string>();
    for (const d of docs ?? []) if (!parConsultant.has(d.consultant_id)) parConsultant.set(d.consultant_id, d.url_web);
    for (const l of retenus) l.word_url ??= parConsultant.get(l.consultant_id) ?? null;
  }
  return retenus;
}

/**
 * Compétences demandées retrouvées dans les textes (CV, CV reçus, PDF anonymisés, ligne de l'Excel, poste) :
 * personne -> identifiants des compétences trouvées. Sans IA.
 */
export async function competencesDansLesTextes(supabase: SupabaseClient, competenceIds: string[]): Promise<Map<string, Set<string>>> {
  const ids = competenceIds.filter((id) => !id.startsWith("texte:"));
  const resultat = new Map<string, Set<string>>();
  if (!ids.length) return resultat;
  const { data: comps } = await supabase.from("competences").select("id, nom_canonique, synonymes").in("id", ids);
  const avecMotif = (comps ?? []).map((k) => ({ id: k.id as string, motif: motifCompetence(k.nom_canonique, k.synonymes ?? []) })).filter((k) => k.motif);
  if (!avecMotif.length) return resultat;
  const { data } = await supabase.rpc("consultants_par_motifs", { p_motifs: avecMotif.map((k) => k.motif) });
  for (const r of (data ?? []) as { consultant_id: string; trouves: number[] }[]) {
    resultat.set(r.consultant_id, new Set(r.trouves.map((i) => avecMotif[i - 1].id)));
  }
  return resultat;
}

/** Ajoute les compétences trouvées seulement dans les textes (points partiels). */
export function avecTextes(competences: { competence_id: string; annees: number | null }[], trouvees?: Set<string>) {
  if (!trouvees?.size) return competences;
  const deja = new Set(competences.map((c) => c.competence_id));
  return [...competences, ...[...trouvees].filter((id) => !deja.has(id)).map((id) => ({ competence_id: id, annees: null, partiel: true }))];
}

/** Données de classement pour des personnes données (mêmes champs que candidats_mission, sans proximité sémantique). */
async function chargerCandidats(supabase: SupabaseClient, ids: string[]): Promise<LigneCandidat[]> {
  const lignes: LigneCandidat[] = [];
  for (let i = 0; i < ids.length; i += 1000) {
    const { data } = await supabase.rpc("candidats_recherche", { p_competences: [], p_motifs_poste: [], p_ids: ids.slice(i, i + 1000) });
    for (const c of (data ?? []) as (LigneCandidat & { competences: { competence_id: string; annees: number | null }[] })[]) lignes.push({ ...c, similarite: null });
  }
  return lignes;
}
