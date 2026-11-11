import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CriteresRecherche } from "@/lib/ai";
import { indexerReferentiel, resoudreCompetence, type CompetenceReferentiel } from "@/lib/matching/referentiel";
import { PONDERATIONS_PAR_DEFAUT, scorerConsultant, type ExigenceCompetence, type Seniorite } from "@/lib/matching/score";
import { avecTextes, competencesDansLesTextes, ponderationsReglees } from "@/lib/matching/classement";
import { sansAccents } from "@/lib/metier/texte";

/**
 * Section « Recherche » : classe les consultants selon des critères (issus de la conversation), sans IA.
 * Même calcul de score que les missions ; la disponibilité est ignorée pour l'instant.
 */

export type Criteres = Omit<CriteresRecherche, "reponse">;

export interface ResultatRecherche {
  id: string;
  prenom: string;
  nom: string;
  trigramme: string;
  intitule_poste: string | null;
  statut: string;
  localisation: string | null;
  mobilite: string | null;
  annees: number | null;
  seniorite: string | null;
  resume: string | null;
  disponibilite: string | null;
  telephone: string | null;
  email: string | null;
  word_url: string | null;
  pdf_url: string | null;
  competences: { nom: string; demandee: boolean }[];
  score: number;
  elimine: boolean;
  manquantes: string[];
  raisons: string[];
  lieu: "ok" | "inconnu" | "autre" | null;
  extrait: { texte: string; source: string } | null;
}

interface Ligne {
  consultant_id: string; prenom: string; nom: string; trigramme: string; telephone_e164: string | null; email: string | null;
  intitule_poste: string | null; statut: string; disponibilite: string | null; disponible_le: string | null; disponibilite_maj_le: string | null;
  localisation: string | null; mobilite: string | null; annees_experience: number | null; seniorite: Seniorite | null; resume: string | null;
  competences: { competence_id: string; nom: string; annees: number | null }[]; pdf_anonyme_url: string | null; word_url: string | null;
}

const MOBILITE_LARGE = ["france", "monde", "europe", "international", "partout", "toute la france"];
const ILE_DE_FRANCE = ["paris", "ile-de-france", "ile de france", "idf", "75", "77", "78", "91", "92", "93", "94", "95", "la defense", "boulogne", "nanterre", "saint-denis", "versailles", "massy", "issy", "courbevoie", "puteaux"];

const min = (t: string) => sansAccents(t).toLowerCase();

/** Le consultant peut-il travailler au lieu demandé ? (mobilité d'abord, puis localisation) */
export function compatibiliteLieu(lieu: string | null, localisation: string | null, mobilite: string | null): ResultatRecherche["lieu"] {
  if (!lieu) return null;
  const l = min(lieu);
  const enIDF = ILE_DE_FRANCE.some((v) => l.includes(v));
  for (const texte of [mobilite, localisation]) {
    if (!texte) continue;
    const t = min(texte);
    if (t.includes(l) || l.includes(t)) return "ok";
    if (texte === mobilite && MOBILITE_LARGE.some((v) => t.includes(v))) return "ok";
    if (enIDF && ILE_DE_FRANCE.some((v) => t.includes(v))) return "ok";
  }
  return mobilite || localisation ? "autre" : "inconnu";
}

/** Motifs SQL (ilike) pour l'intitulé de poste, avec et sans accents. */
export function motifsPoste(poste: string | null): string[] {
  if (!poste?.trim()) return [];
  const p = poste.trim().replace(/[%_]/g, "");
  return [...new Set([`%${p}%`, `%${sansAccents(p)}%`])];
}

/** Recherche dans le texte des CV : identifiants des consultants et extrait. */
async function chercherDansCV(supabase: SupabaseClient, texte: string) {
  const { data } = await supabase.rpc("rechercher_dans_cv_extraits", { p_texte: `"${texte.replace(/"/g, "")}"` });
  return new Map(((data ?? []) as { consultant_id: string; extrait: string; source: string }[]).map((d) => [d.consultant_id, { texte: d.extrait, source: d.source }]));
}

export async function rechercherProfils(supabase: SupabaseClient, criteres: Criteres): Promise<ResultatRecherche[]> {
  const [{ data: ref }, ponderationsBase] = await Promise.all([
    supabase.from("competences").select("id, nom_canonique, synonymes"),
    ponderationsReglees(supabase),
  ]);
  const index = indexerReferentiel((ref ?? []) as CompetenceReferentiel[]);

  // Compétences : connues du référentiel (par identifiant) ou cherchées dans le texte des CV.
  const exigences: ExigenceCompetence[] = [];
  const parTexte = new Map<string, Map<string, { texte: string; source: string }>>(); // pseudo-identifiant -> consultants
  await Promise.all(criteres.competences.map(async (c) => {
    const k = resoudreCompetence(c.nom, index);
    const id = k?.id ?? `texte:${min(c.nom)}`;
    if (exigences.some((e) => e.competence_id === id)) return;
    exigences.push({ competence_id: id, nom: k?.nom_canonique ?? c.nom, obligatoire: c.obligatoire, importance: c.obligatoire ? 3 : 2, annees_min: null });
    if (!k) parTexte.set(id, await chercherDansCV(supabase, c.nom));
  }));

  // Mots-clés (entreprises, secteurs, certifications) : tous doivent figurer dans un CV de la personne.
  const motsCles = await Promise.all(criteres.mots_cles.map((m) => chercherDansCV(supabase, m)));
  const avecMotsCles: Set<string> | null = motsCles.length
    ? motsCles.slice(1).reduce((acc, m) => new Set([...acc].filter((x) => m.has(x))), new Set(motsCles[0].keys()))
    : null;

  const idsConnus = exigences.filter((e) => !e.competence_id.startsWith("texte:")).map((e) => e.competence_id);
  // Compétences connues retrouvées dans les textes (CV non analysés, lignes Excel) : points partiels.
  const dansLesTextes = await competencesDansLesTextes(supabase, idsConnus);
  const idsTexte = new Set<string>([...parTexte.values()].flatMap((m) => [...m.keys()]));
  for (const id of dansLesTextes.keys()) idsTexte.add(id);
  // Sans compétence ni poste, les mots-clés seuls désignent les candidats.
  if (avecMotsCles && !idsConnus.length && !criteres.poste) for (const id of avecMotsCles) idsTexte.add(id);
  if (!idsConnus.length && !idsTexte.size && !criteres.poste) return [];

  const { data, error } = await supabase.rpc("candidats_recherche", {
    p_competences: idsConnus, p_motifs_poste: motifsPoste(criteres.poste), p_ids: [...idsTexte].slice(0, 3000),
  });
  if (error) throw new Error(error.message);

  // La disponibilité ne compte pas pour l'instant ; pas de proximité sémantique sans mission enregistrée.
  const ponderations = { ...PONDERATIONS_PAR_DEFAUT, ...ponderationsBase, disponibilite: 0 };
  const mission = { competences: exigences, annees_min: criteres.annees_min, seniorite: criteres.seniorite, localisation: null };
  const motsPoste = motsSignificatifs(criteres.poste);

  const lignes = ((data ?? []) as Ligne[])
    .filter((c) => !avecMotsCles || avecMotsCles.has(c.consultant_id))
    .map((c) => {
      const possedees: { competence_id: string; annees: number | null; partiel?: boolean }[] = avecTextes(c.competences.map((k) => ({ competence_id: k.competence_id, annees: k.annees })), dansLesTextes.get(c.consultant_id));
      for (const [id, m] of parTexte) if (m.has(c.consultant_id)) possedees.push({ competence_id: id, annees: null, partiel: true });
      const r = scorerConsultant(mission, {
        competences: possedees, annees_experience: c.annees_experience === null ? null : Number(c.annees_experience),
        seniorite: c.seniorite, disponible_le: null, disponibilite: null, disponibilite_maj_le: null, localisation: c.localisation, similarite: null,
      }, ponderations);

      let score = r.score;
      const raisons = r.raisons.filter((x) => x.critere !== "disponibilite" && x.max > 0 && !/^(Pas d'exigence|Aucune compétence précisée)/.test(x.texte)).map((x) => x.texte);
      const poste = min(c.intitule_poste ?? "");
      if (motsPoste.length) {
        const ok = motsPoste.some((m) => poste.includes(m));
        if (!ok) score *= 0.85;
        raisons.unshift(ok ? `Poste : ${c.intitule_poste}` : `Poste différent : ${c.intitule_poste ?? "non renseigné"}`);
      }
      const annees = c.annees_experience === null ? null : Number(c.annees_experience);
      if (criteres.annees_max !== null && annees !== null && annees > criteres.annees_max + 3) {
        score *= 0.92;
        raisons.push(`${annees} ans d'expérience (au-delà des ${criteres.annees_max} demandés)`);
      }
      const lieu = compatibiliteLieu(criteres.lieu, c.localisation, c.mobilite);
      if (lieu === "autre") score *= 0.9;
      if (lieu) raisons.push(lieu === "ok" ? `Compatible avec ${criteres.lieu}` : lieu === "inconnu" ? "Lieu et mobilité non renseignés" : `Localisé ailleurs (${c.mobilite ?? c.localisation})`);

      const demandees = new Set(exigences.map((e) => e.competence_id));
      const extrait = motsCles.map((m) => m.get(c.consultant_id)).find(Boolean)
        ?? [...parTexte.values()].map((m) => m.get(c.consultant_id)).find(Boolean) ?? null;
      return {
        resultat: r,
        ligne: {
          id: c.consultant_id, prenom: c.prenom, nom: c.nom, trigramme: c.trigramme, intitule_poste: c.intitule_poste, statut: c.statut,
          localisation: c.localisation, mobilite: c.mobilite, annees, seniorite: c.seniorite, resume: c.resume, disponibilite: c.disponibilite,
          telephone: c.telephone_e164, email: c.email, word_url: c.word_url, pdf_url: c.pdf_anonyme_url,
          competences: [
            ...c.competences.filter((k) => demandees.has(k.competence_id)).map((k) => ({ nom: k.nom, demandee: true })),
            ...possedees.filter((p) => p.partiel).map((p) => ({ nom: `${exigences.find((e) => e.competence_id === p.competence_id)?.nom ?? "?"} (CV)`, demandee: true })),
            ...c.competences.filter((k) => !demandees.has(k.competence_id)).sort((a, b) => (b.annees ?? 0) - (a.annees ?? 0)).slice(0, 8).map((k) => ({ nom: k.nom, demandee: false })),
          ],
          score: Math.round(score), elimine: r.elimine,
          manquantes: exigences.filter((e) => e.obligatoire && !possedees.some((p) => p.competence_id === e.competence_id)).map((e) => e.nom),
          raisons, lieu, extrait,
        } satisfies ResultatRecherche,
      };
    });

  // À score égal : lieu compatible d'abord, puis l'expérience la plus proche de celle demandée, puis le plus de compétences.
  const cible = criteres.annees_min ?? criteres.annees_max;
  const ecart = (a: number | null) => (cible === null ? 0 : a === null ? 99 : a < (criteres.annees_min ?? 0) ? (criteres.annees_min ?? 0) - a : criteres.annees_max !== null && a > criteres.annees_max ? a - criteres.annees_max : 0);
  const rangLieu = { ok: 0, inconnu: 1, autre: 2 } as const;
  return lignes.map((l) => l.ligne).sort((a, b) =>
    Number(a.elimine) - Number(b.elimine) || b.score - a.score
    || (a.lieu ? rangLieu[a.lieu] : 0) - (b.lieu ? rangLieu[b.lieu] : 0)
    || ecart(a.annees) - ecart(b.annees)
    || b.competences.filter((k) => k.demandee).length - a.competences.filter((k) => k.demandee).length,
  ).slice(0, 300);
}

const GENERIQUES = new Set(["developpeur", "developpeuse", "consultant", "consultante", "ingenieur", "ingenieure", "senior", "junior", "confirme",
  "confirmee", "expert", "experte", "chef", "lead", "tech", "technique", "projet", "analyste", "architecte", "manager", "responsable", "full", "stack", "fullstack"]);

/** Mots de l'intitulé recherché ; les mots génériques (« développeur », « senior »…) sont ignorés s'il reste un mot précis (« .NET »). */
export function motsSignificatifs(poste: string | null): string[] {
  if (!poste) return [];
  const mots = min(poste).split(/[\s/,()–-]+/).filter((m) => m.length >= 3 || /[#+.]/.test(m));
  const precis = mots.filter((m) => !GENERIQUES.has(m));
  return precis.length ? precis : mots;
}

/** Liste affichée à l'arrivée (avant toute recherche) : les profils analysés les plus récents. Sans IA. */
export async function profilsRecents(supabase: SupabaseClient, limite = 150): Promise<ResultatRecherche[]> {
  // Profils dont le CV est analysé (compétences connues), du plus récent au plus ancien.
  const { data: recents } = await supabase.from("profils").select("consultant_id, created_at")
    .order("created_at", { ascending: false }).limit(limite);
  const ordre = new Map((recents ?? []).map((c, i) => [c.consultant_id as string, i]));
  if (!ordre.size) return [];
  const { data } = await supabase.rpc("candidats_recherche", { p_competences: [], p_motifs_poste: [], p_ids: [...ordre.keys()] });
  return ((data ?? []) as Ligne[])
    .sort((a, b) => (ordre.get(a.consultant_id) ?? 0) - (ordre.get(b.consultant_id) ?? 0))
    .map((c) => ({
      id: c.consultant_id, prenom: c.prenom, nom: c.nom, trigramme: c.trigramme, intitule_poste: c.intitule_poste, statut: c.statut,
      localisation: c.localisation, mobilite: c.mobilite, annees: c.annees_experience === null ? null : Number(c.annees_experience), seniorite: c.seniorite,
      resume: c.resume, disponibilite: c.disponibilite, telephone: c.telephone_e164, email: c.email, word_url: c.word_url, pdf_url: c.pdf_anonyme_url,
      competences: [...c.competences].sort((a, b) => (b.annees ?? 0) - (a.annees ?? 0)).slice(0, 10).map((k) => ({ nom: k.nom, demandee: false })),
      score: 0, elimine: false, manquantes: [], raisons: [], lieu: null, extrait: null,
    }));
}
