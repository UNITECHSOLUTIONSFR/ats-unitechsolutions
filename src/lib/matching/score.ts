/**
 * Score d'adéquation consultant / mission, sur 100, calculé SANS IA et explicable.
 * 1. Filtres éliminatoires : compétences obligatoires (et, si demandé, disponibilité ou localisation).
 * 2. Score pondéré (pondérations réglables par un administrateur) :
 *    compétences communes, années d'expérience, séniorité, disponibilité, proximité sémantique.
 * Le score est une aide à la décision : il n'entraîne jamais de refus automatique.
 */

export type Seniorite = "junior" | "confirme" | "senior" | "expert";
const RANG: Record<Seniorite, number> = { junior: 0, confirme: 1, senior: 2, expert: 3 };

export interface Ponderations {
  competences: number;
  annees: number;
  seniorite: number;
  disponibilite: number;
  semantique: number;
}

export const PONDERATIONS_PAR_DEFAUT: Ponderations = {
  competences: 45,
  annees: 15,
  seniorite: 10,
  disponibilite: 10,
  semantique: 20,
};

export interface ExigenceCompetence {
  competence_id: string;
  nom: string;
  obligatoire: boolean;
  importance: 1 | 2 | 3; // 3 = très importante
  annees_min?: number | null;
}

export interface MissionAScorer {
  competences: ExigenceCompetence[];
  annees_min?: number | null;
  seniorite?: Seniorite | null;
  date_debut?: string | null; // AAAA-MM-JJ
  localisation?: string | null;
  disponibilite_obligatoire?: boolean;
  localisation_obligatoire?: boolean;
}

export interface ConsultantAScorer {
  /** partiel : compétence trouvée seulement dans le texte du CV ou de l'Excel (non analysée) → 60 % des points. */
  competences: { competence_id: string; annees?: number | null; partiel?: boolean }[];
  annees_experience?: number | null;
  seniorite?: Seniorite | null;
  disponible_le?: string | null;
  disponibilite?: string | null; // texte libre (« immédiate »…)
  disponibilite_maj_le?: string | null;
  localisation?: string | null;
  similarite?: number | null; // similarité cosinus 0..1 entre profil et mission (pgvector)
}

export interface Raison {
  critere: keyof Ponderations | "filtre";
  points: number;
  max: number;
  texte: string;
}

export interface ResultatScore {
  score: number; // 0..100
  elimine: boolean;
  motifsElimination: string[];
  raisons: Raison[];
  alertes: string[]; // ex. disponibilité non mise à jour depuis 3 mois
  /** Explication en langage clair, pour le recruteur : ce qui colle, ce qui manque, ce qu'il faut vérifier au téléphone. */
  explication?: Explication;
}

export interface Explication {
  atouts: string[];
  manques: string[];
  aVerifier: string[];
}

const JOUR = 86_400_000;
const arrondi = (n: number) => Math.round(n * 10) / 10;
const sansAccentsMin = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function estDisponibleImmediatement(texte?: string | null): boolean {
  return !!texte && /immediat|de suite|tout de suite|disponible|asap|libre/.test(sansAccentsMin(texte));
}

/** Part des points d'une compétence trouvée seulement dans le texte (CV non analysé, ligne Excel). */
export const POIDS_TEXTE = 0.6;

export function scorerConsultant(
  mission: MissionAScorer,
  consultant: ConsultantAScorer,
  ponderations: Ponderations = PONDERATIONS_PAR_DEFAUT,
  aujourdHui: Date = new Date(),
): ResultatScore {
  const raisons: Raison[] = [];
  const alertes: string[] = [];
  const motifsElimination: string[] = [];
  const parId = new Map(consultant.competences.map((c) => [c.competence_id, c]));

  // ---- 1. Filtres éliminatoires
  const manquantes = mission.competences.filter((e) => e.obligatoire && !parId.has(e.competence_id));
  if (manquantes.length) motifsElimination.push(`Compétence(s) obligatoire(s) absente(s) : ${manquantes.map((m) => m.nom).join(", ")}`);

  const dispo = evaluerDisponibilite(mission, consultant, aujourdHui);
  if (mission.disponibilite_obligatoire && dispo.ratio < 1) motifsElimination.push(`Disponibilité : ${dispo.texte}`);

  if (mission.localisation_obligatoire && mission.localisation) {
    const ok = !!consultant.localisation && sansAccentsMin(consultant.localisation).includes(sansAccentsMin(mission.localisation));
    if (!ok) motifsElimination.push(`Localisation différente de « ${mission.localisation} »`);
  }

  if (consultant.disponibilite_maj_le) {
    const age = (aujourdHui.getTime() - new Date(consultant.disponibilite_maj_le).getTime()) / JOUR;
    if (age > 90) alertes.push(`Disponibilité non mise à jour depuis ${Math.floor(age / 30)} mois`);
  }

  // ---- 2. Score pondéré. Un critère sans information côté mission donne ses points (il ne pénalise pas) ;
  // la proximité sémantique absente est retirée du calcul, et le score est ramené sur 100.
  const criteres: { cle: keyof Ponderations; ratio: number | null; texte: string }[] = [];

  // Compétences
  if (mission.competences.length) {
    const total = mission.competences.reduce((s, e) => s + e.importance, 0);
    const communes = mission.competences.filter((e) => parId.has(e.competence_id));
    const obtenu = communes.reduce((s, e) => s + e.importance * (parId.get(e.competence_id)!.partiel ? POIDS_TEXTE : 1), 0);
    criteres.push({
      cle: "competences",
      ratio: obtenu / total,
      texte: `${communes.length}/${mission.competences.length} compétences : ${
        communes.map((c) => (parId.get(c.competence_id)!.partiel ? `${c.nom} (dans le CV)` : c.nom)).join(", ") || "aucune"
      }${
        communes.length < mission.competences.length
          ? ` (manque : ${mission.competences.filter((e) => !parId.has(e.competence_id)).map((e) => e.nom).join(", ")})`
          : ""
      }`,
    });
  } else criteres.push({ cle: "competences", ratio: 1, texte: "Aucune compétence précisée dans la mission" });

  // Années d'expérience
  const avecMin = mission.competences.filter((e) => e.annees_min && parId.has(e.competence_id));
  if (avecMin.length) {
    const ratios = avecMin.map((e) => Math.min(1, (parId.get(e.competence_id)!.annees ?? 0) / e.annees_min!));
    criteres.push({
      cle: "annees",
      ratio: ratios.reduce((a, b) => a + b, 0) / ratios.length,
      texte: avecMin.map((e) => `${e.nom} : ${parId.get(e.competence_id)!.annees ?? 0} an(s) / ${e.annees_min} demandé(s)`).join(" ; "),
    });
  } else if (mission.annees_min) {
    const a = consultant.annees_experience ?? 0;
    criteres.push({ cle: "annees", ratio: Math.min(1, a / mission.annees_min), texte: `${a} an(s) d'expérience / ${mission.annees_min} demandé(s)` });
  } else criteres.push({ cle: "annees", ratio: 1, texte: "Pas d'exigence d'années" });

  // Séniorité
  if (mission.seniorite) {
    if (!consultant.seniorite) criteres.push({ cle: "seniorite", ratio: 0.5, texte: "Séniorité du consultant inconnue" });
    else {
      const ecart = Math.abs(RANG[mission.seniorite] - RANG[consultant.seniorite]);
      criteres.push({
        cle: "seniorite",
        ratio: ecart === 0 ? 1 : ecart === 1 ? 0.5 : 0,
        texte: `Séniorité ${consultant.seniorite} pour ${mission.seniorite} demandé`,
      });
    }
  } else criteres.push({ cle: "seniorite", ratio: 1, texte: "Pas d'exigence de séniorité" });

  criteres.push({ cle: "disponibilite", ratio: dispo.ratio, texte: dispo.texte });

  // Proximité sémantique : similarité cosinus ~0,70 (sans rapport) à ~0,90 (très proche)
  if (consultant.similarite === null || consultant.similarite === undefined) {
    criteres.push({ cle: "semantique", ratio: null, texte: "Proximité sémantique non calculée" });
  } else {
    const r = Math.max(0, Math.min(1, (consultant.similarite - 0.7) / 0.2));
    criteres.push({ cle: "semantique", ratio: r, texte: `Profil proche du besoin à ${Math.round(r * 100)} %` });
  }

  const poidsUtiles = criteres.filter((c) => c.ratio !== null).reduce((s, c) => s + ponderations[c.cle], 0) || 1;
  let score = 0;
  for (const c of criteres) {
    const max = ponderations[c.cle];
    if (c.ratio === null) {
      raisons.push({ critere: c.cle, points: 0, max: 0, texte: c.texte });
      continue;
    }
    const points = (c.ratio * max * 100) / poidsUtiles;
    score += points;
    raisons.push({ critere: c.cle, points: arrondi(points), max: arrondi((max * 100) / poidsUtiles), texte: c.texte });
  }

  return { score: arrondi(score), elimine: motifsElimination.length > 0, motifsElimination, raisons, alertes, explication: expliquer(mission, consultant, parId, alertes) };
}

const liste = (noms: string[]) => noms.length <= 1 ? noms.join("") : `${noms.slice(0, -1).join(", ")} et ${noms[noms.length - 1]}`;
const SENIORITE: Record<Seniorite, string> = { junior: "junior", confirme: "confirmé", senior: "senior", expert: "expert" };

/** Phrases simples : atouts, manques, points à vérifier (même calcul que le score, sans IA). */
function expliquer(mission: MissionAScorer, c: ConsultantAScorer, parId: Map<string, ConsultantAScorer["competences"][number]>, alertes: string[]): Explication {
  const atouts: string[] = [], manques: string[] = [], aVerifier: string[] = [];
  const indisp = mission.competences.filter((e) => e.obligatoire), autres = mission.competences.filter((e) => !e.obligatoire);
  const a = (e: ExigenceCompetence) => parId.has(e.competence_id);
  const sur = (e: ExigenceCompetence) => a(e) && !parId.get(e.competence_id)!.partiel;
  const vuCV = (e: ExigenceCompetence) => a(e) && !!parId.get(e.competence_id)!.partiel;
  const ans = (e: ExigenceCompetence) => { const n = parId.get(e.competence_id)?.annees; return n ? `${e.nom} (${n} an${n > 1 ? "s" : ""})` : e.nom; };
  if (indisp.length) {
    if (indisp.every(a)) atouts.push(`A toutes les compétences indispensables : ${liste(indisp.map(ans))}`);
    else {
      if (indisp.some(a)) atouts.push(`Indispensables présentes : ${liste(indisp.filter(a).map(ans))}`);
      manques.push(`Indispensable absente : ${liste(indisp.filter((e) => !a(e)).map((e) => e.nom))}`);
    }
  }
  if (autres.some(sur)) atouts.push(`Maîtrise aussi : ${liste(autres.filter(sur).map(ans))}`);
  if (autres.some((e) => !a(e))) manques.push(`Il lui manque : ${liste(autres.filter((e) => !a(e)).map((e) => e.nom))}`);
  const seulementCV = mission.competences.filter(vuCV);
  if (seulementCV.length) aVerifier.push(`Cité dans son CV, à confirmer : ${liste(seulementCV.map((e) => e.nom))}`);
  if (mission.annees_min) {
    const n = c.annees_experience;
    if (n === null || n === undefined) aVerifier.push(`Années d'expérience inconnues (${mission.annees_min} ans demandés)`);
    else if (n >= mission.annees_min) atouts.push(`${n} ans d'expérience pour ${mission.annees_min} demandés`);
    else manques.push(`${n} ans d'expérience pour ${mission.annees_min} demandés`);
  }
  if (mission.seniorite) {
    if (!c.seniorite) aVerifier.push(`Séniorité inconnue (${SENIORITE[mission.seniorite]} demandé)`);
    else if (c.seniorite === mission.seniorite) atouts.push(`Profil ${SENIORITE[c.seniorite]}, comme demandé`);
    else (RANG[c.seniorite] > RANG[mission.seniorite] ? atouts : manques).push(`Profil ${SENIORITE[c.seniorite]} (${SENIORITE[mission.seniorite]} demandé)`);
  }
  if (c.disponible_le) {
    const debut = mission.date_debut ? new Date(mission.date_debut) : new Date();
    const d = new Date(c.disponible_le);
    (d <= debut ? atouts : manques).push(`Disponible le ${d.toLocaleDateString("fr-FR")}${d <= debut ? "" : " (après le démarrage)"}`);
  } else if (estDisponibleImmediatement(c.disponibilite)) atouts.push(`Disponibilité : ${c.disponibilite}`);
  else aVerifier.push(c.disponibilite ? `Disponibilité à préciser : « ${c.disponibilite} »` : "Disponibilité inconnue : à demander");
  for (const al of alertes) aVerifier.push(al);
  return { atouts, manques, aVerifier };
}

function evaluerDisponibilite(m: MissionAScorer, c: ConsultantAScorer, aujourdHui: Date): { ratio: number; texte: string } {
  const debut = m.date_debut ? new Date(m.date_debut) : aujourdHui;
  if (c.disponible_le) {
    const retard = (new Date(c.disponible_le).getTime() - debut.getTime()) / JOUR;
    if (retard <= 0) return { ratio: 1, texte: `Disponible le ${c.disponible_le}` };
    if (retard <= 30) return { ratio: 0.5, texte: `Disponible le ${c.disponible_le} (${Math.ceil(retard)} j après le début)` };
    return { ratio: 0, texte: `Disponible le ${c.disponible_le} (trop tard)` };
  }
  if (estDisponibleImmediatement(c.disponibilite)) return { ratio: 1, texte: `Disponibilité : ${c.disponibilite}` };
  if (c.disponibilite) return { ratio: 0.5, texte: `Disponibilité à vérifier : ${c.disponibilite}` };
  return { ratio: 0.5, texte: "Disponibilité inconnue" };
}

/** Classe les consultants : non éliminés d'abord, puis par score décroissant. */
export function classer<T extends { resultat: ResultatScore }>(liste: T[]): T[] {
  return [...liste].sort((a, b) => Number(a.resultat.elimine) - Number(b.resultat.elimine) || b.resultat.score - a.resultat.score);
}
