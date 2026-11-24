import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clientSupabaseAdmin } from "@/lib/supabase/admin";
import { estPertinent, noteAffichee, type LigneClassement } from "./classement";
import { calculerEmpreintesConsultants } from "./empreintes";
import { classerMission } from "./hybride";

/**
 * Classements rangés dans la base (table classements_mission) : calculés en arrière-plan, lus instantanément.
 * - Ouvrir une mission lit le dernier classement complet (aucun calcul), avec sa date.
 * - Une mission modifiée, de nouvelles fiches ou un nouveau CV analysé demandent un recalcul ; la tâche « matching »
 *   (toutes les 10 minutes) le fait, une mission après l'autre. L'ancien classement reste affiché pendant ce temps.
 * - Chaque nuit, tous les classements des missions ouvertes sont refaits (disponibilités mises à jour, etc.).
 * - Un déploiement ne recalcule rien. Changer les règles du moteur : augmenter VERSION_MOTEUR (tout est refait).
 * L'IA ne lit que les profils qui entrent dans les 30 premiers sans avis déjà rendu (voir tri-ia) : coût maîtrisé.
 */
export const VERSION_MOTEUR = "2026-11-17.3-pertinents";
/** Matching v2 (18/11/2026) : la base cherche les critères dans les CV complets, l'IA départage. Activé par le réglage « matching_v2 ». */
export const VERSION_MOTEUR_V2 = "2026-11-19.1-ordre";

/** Le matching v2 est-il activé (réglage matching_v2) ? Tant qu'il ne l'est pas, il est seulement calculé en aperçu. */
export async function matchingV2Actif(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase.from("reglages").select("valeur").eq("cle", "matching_v2").maybeSingle();
  return data?.valeur === true;
}

export interface ClassementResume {
  total: number;
  pertinents: number;
  /** Matching v2 : profils qui remplissent le métier et tous les critères obligatoires (null : pas de critères). */
  eligibles?: number | null;
  /** Les 60 premiers, avec le détail du score. */
  top: LigneClassement[];
}
export interface ClassementStocke extends ClassementResume {
  calculeLe: string | null;
  /** Version du moteur qui a produit ce classement (« ancienne note » si ce n'est pas le nouveau matching). */
  version?: string | null;
  /** Vrai quand un recalcul est demandé ou en cours : le classement affiché est celui d'avant. */
  miseAJour: boolean;
}

/** Statuts dont le classement est tenu à jour en arrière-plan. */
const STATUTS_SUIVIS = ["ouverte", "chez_client"];
/** Au-delà, un classement est refait même sans demande (disponibilités, fiches modifiées dans l'Excel…). */
const AGE_MAX_MS = 20 * 3600_000;
/**
 * Fiches modifiées : un classement n'est pas refait plus souvent que cela pour cette raison (chaque calcul relit toute la base).
 * Une fiche créée ou modifiée dans l'outil est, elle, comparée tout de suite à ses missions proches (profil.ts).
 */
const DELAI_CHANGEMENTS_MS = 3 * 3600_000;
/** Un calcul bloqué depuis plus longtemps (serveur arrêté) est considéré comme abandonné. */
const CALCUL_ABANDONNE_MS = 6 * 60_000;


/** Calcule le classement d'une mission (tri de toute la base, puis avis de l'IA sur les 30 premiers) et le range. */
export async function calculerEtRanger(missionId: string, supabase: SupabaseClient = clientSupabaseAdmin()): Promise<ClassementResume> {
  // Nouveau matching (24/11/2026) : seules les missions de « Missions en cours » sont lues, une seule fois ; les autres
  // gardent leur classement (aucun recalcul, même modifiées).
  const v4 = await import("./v4");
  if (await v4.matchingV4Actif(supabase)) {
    const [{ data: m }, deja] = await Promise.all([
      supabase.from("missions").select("trello_colonne").eq("id", missionId).maybeSingle(),
      supabase.from("classements_mission").select("version, a_recalculer").eq("mission_id", missionId).maybeSingle(),
    ]);
    const dejaLue = deja.data?.version === v4.VERSION_MOTEUR_V4 && !deja.data?.a_recalculer;
    if (v4.aLire(m?.trello_colonne) && !dejaLue) await v4.lireMissionV4(supabase, missionId);
    return (await lireClassement(supabase, missionId)) ?? { total: 0, pertinents: 0, eligibles: null, top: [] };
  }
  const debut = Date.now();
  // Réservation : si un autre calcul de cette mission tourne déjà, on ne le double pas.
  const { data: reserve } = await supabase.rpc("reserver_calcul_classement", { p_mission_id: missionId, p_abandon_secondes: CALCUL_ABANDONNE_MS / 1000 });
  if (reserve === false) {
    const deja = await lireClassement(supabase, missionId);
    if (deja) return deja;
  }
  // Demandes arrivées pendant le calcul : gardées (le calcul suivant les prendra).
  const demandeAvant = new Date().toISOString();
  try {
    // Présélection par le sens et par les compétences, puis note de l'IA sur les 60 premiers (voir hybride.ts).
    const v2 = await matchingV2Actif(supabase);
    const { matchingV3Actif, VERSION_MOTEUR_V3 } = await import("./v3");
    const v3 = await matchingV3Actif(supabase);
    const { classerMissionV3IA } = await import("./v3-ia");
    const lignes = v3 ? await classerMissionV3IA(supabase, missionId) : await classerMission(supabase, missionId, { v2 });
    // Rangés : les profils pertinents (note de l'IA ≥ 60) d'abord, jusqu'à 100. Scores (fiche consultant) : notes de l'IA seulement.
    // Gardés : les 100 premiers (pertinents d'abord), et les profils « proches » montrés à part avec ce qui leur manque.
    const proches = lignes.filter((l) => l.eligible === false && l.manques);
    const top = [...lignes.slice(0, 100), ...proches.filter((p) => !lignes.slice(0, 100).includes(p))];
    const eligibles = lignes.some((l) => l.eligible === false) ? lignes.filter((l) => l.eligible && !l.resultat.elimine).length : null;
    const resume: ClassementResume = { total: lignes.length, pertinents: lignes.filter(estPertinent).length, eligibles, top };
    // Classement complet : profils lus par l'IA (meilleure note d'abord), puis tous les autres par score calculé.
    const comparables = lignes.filter((l) => !l.resultat.elimine);
    // Ordre : 1) profils lus par l'IA et jugés pertinents (note ≥ 60) ; 2) profils pas encore lus, par score calculé ;
    // 3) profils lus et écartés par l'IA (critère non prouvé), en dernier.
    const lus = comparables.filter((l) => l.avisIA?.note != null).sort((a, b) => (b.avisIA!.note! - a.avisIA!.note!));
    const autres = comparables.filter((l) => l.avisIA?.note == null).sort((a, b) => b.resultat.score - a.resultat.score);
    const entree = (l: LigneClassement, lu: number) => [l.consultant_id, Math.round(lu ? l.avisIA!.note! : l.resultat.score), lu];
    const ordre = [...lus.filter(estPertinent).map((l) => entree(l, 1)), ...autres.map((l) => entree(l, 0)), ...lus.filter((l) => !estPertinent(l)).map((l) => entree(l, 1))];
    const scores = Object.fromEntries(lignes.filter((l) => l.avisIA?.note != null).map((l) => [l.consultant_id, [noteAffichee(l), l.resultat.elimine]]));
    const { data: ligne } = await supabase.from("classements_mission").select("demande_le").eq("mission_id", missionId).maybeSingle();
    const redemande = !!ligne && Date.parse(ligne.demande_le) > Date.parse(demandeAvant);
    // Publication d'un bloc : le nouveau classement remplace l'ancien seulement une fois complet.
    await supabase.from("classements_mission").upsert({
      mission_id: missionId, total: resume.total, pertinents: resume.pertinents, eligibles: resume.eligibles ?? null, top: resume.top, scores, ordre,
      calcule_le: new Date().toISOString(), duree_ms: Date.now() - debut, version: v3 ? VERSION_MOTEUR_V3 : v2 ? VERSION_MOTEUR_V2 : VERSION_MOTEUR,
      a_recalculer: redemande, en_calcul_depuis: null, erreur: null,
    });
    return resume;
  } catch (e) {
    // Échec : l'ancien classement reste en place, avec sa date ; nouvel essai au prochain passage.
    await supabase.from("classements_mission").update({ en_calcul_depuis: null, erreur: (e as Error).message.slice(0, 300) }).eq("mission_id", missionId);
    throw e;
  }
}

/** Dernier classement rangé (sans le détail des scores). Null si la mission n'a jamais été classée. */
export async function lireClassement(supabase: SupabaseClient, missionId: string): Promise<ClassementStocke | null> {
  const { data } = await supabase.from("classements_mission")
    .select("total, pertinents, eligibles, top, calcule_le, a_recalculer, en_calcul_depuis, version").eq("mission_id", missionId).maybeSingle();
  if (!data?.calcule_le) return null;
  return {
    total: data.total, pertinents: data.pertinents, eligibles: data.eligibles as number | null, top: data.top as LigneClassement[], calculeLe: data.calcule_le,
    miseAJour: data.a_recalculer || !!data.en_calcul_depuis, version: data.version as string | null,
  };
}

/**
 * Classement à afficher : celui rangé dans la base, lu sans aucun calcul. Une mission jamais classée (toute nouvelle)
 * n'est plus calculée pendant l'ouverture de l'écran (jusqu'à une minute d'attente avec la lecture des CV par l'IA) :
 * le calcul est demandé en arrière-plan et l'écran indique « classement en préparation » (constat du 19/11/2026).
 */
export async function classementAAfficher(missionId: string, supabase: SupabaseClient = clientSupabaseAdmin()): Promise<ClassementStocke> {
  const range = await lireClassement(supabase, missionId);
  if (range) return range;
  await demanderRecalcul(supabase, [missionId]).catch(() => undefined);
  try {
    const { after } = await import("next/server");
    after(() => calculerEtRanger(missionId).then(() => undefined).catch((e) => console.error("Classement :", (e as Error).message)));
  } catch { /* hors requête : la tâche « matching » s'en charge */ }
  return { total: 0, pertinents: 0, eligibles: null, top: [], calculeLe: null, miseAJour: true };
}

/** Classement rangé s'il existe, sans jamais lancer de calcul (listes, accueil). */
export async function classementSiRange(missionId: string, supabase: SupabaseClient = clientSupabaseAdmin()): Promise<ClassementStocke | null> {
  return lireClassement(supabase, missionId).catch(() => null);
}

/** Nombre de profils pertinents et 3 premiers profils de plusieurs missions, en une lecture (liste des missions). */
export async function resumesMissions(supabase: SupabaseClient, missionIds: string[]): Promise<Map<string, { pertinents: number; premiers: LigneClassement[] }>> {
  if (!missionIds.length) return new Map();
  const { data } = await supabase.from("classements_mission").select("mission_id, pertinents, premiers")
    .in("mission_id", missionIds).not("calcule_le", "is", null);
  return new Map((data ?? []).map((r) => [r.mission_id as string, { pertinents: r.pertinents as number, premiers: ((r.premiers ?? []) as LigneClassement[]).slice(0, 5) }]));
}

/** Demande le recalcul de certaines missions, ou de toutes les missions suivies (nouvelles fiches, CV analysés…). */
export async function demanderRecalcul(supabase: SupabaseClient, missionIds?: string[]): Promise<void> {
  const maintenant = new Date().toISOString();
  let ids = missionIds;
  if (!ids) {
    const { data } = await supabase.from("missions").select("id").in("statut", STATUTS_SUIVIS);
    ids = (data ?? []).map((m) => m.id as string);
  }
  if (!ids.length) return;
  // Ligne créée si besoin (mission nouvelle) ; un classement existant est gardé tel quel jusqu'au recalcul.
  await supabase.from("classements_mission").upsert(ids.map((id) => ({ mission_id: id })), { onConflict: "mission_id", ignoreDuplicates: true });
  // Nouveau matching : une mission n'est lue qu'une fois, jamais recalculée (même modifiée).
  if (await (await import("./v4")).matchingV4Actif(supabase)) return;
  await supabase.from("classements_mission").update({ a_recalculer: true, demande_le: maintenant }).in("mission_id", ids);
}

/**
 * Tâche « matching » : recalcule, une mission après l'autre et dans le temps imparti, les classements à refaire :
 * demandés, jamais calculés, d'une ancienne version du moteur, ou vieux de plus de 20 heures.
 */
export async function recalculerEnAttente(supabase: SupabaseClient, budgetMs = 230_000): Promise<{ recalcules: number; restants: number; erreurs: string[]; nouveauxCV?: number }> {
  if (await (await import("./v4")).matchingV4Actif(supabase)) return passageV4(supabase, budgetMs);
  const debut = Date.now();
  // Empreintes de sens des fiches nouvelles ou modifiées d'abord (une minute au plus par passage), mais seulement si
  // une fiche, un profil, une compétence ou un document a changé depuis la dernière vérification : la recherche des
  // textes à refaire coûte ≈ 5 s à la base, elle était faite toutes les 10 minutes pour rien (audit du 19/11/2026).
  await empreintesSiChangement(supabase).catch((e) => console.error("Empreintes :", (e as Error).message));
  const dernier = (table: string, colonne: string) => supabase.from(table).select(colonne).order(colonne, { ascending: false }).limit(1).maybeSingle()
    .then((r) => Date.parse(String((r.data as Record<string, string> | null)?.[colonne] ?? "1970-01-01")));
  const { matchingV3Actif: v3Actif } = await import("./v3");
  const v3 = await v3Actif(supabase);
  const [{ data: missions }, { data: lignes }, ficheModifiee, profilModifie] = await Promise.all([
    supabase.from("missions").select("id").in("statut", STATUTS_SUIVIS),
    supabase.from("classements_mission").select("mission_id, calcule_le, version, a_recalculer, demande_le"),
    // Matching v3 : seuls les CV découpés comptent (une fiche modifiée sans nouveau CV ne change pas le classement).
    v3 ? dernier("dossiers_cv", "updated_at") : dernier("consultants", "updated_at"),
    v3 ? Promise.resolve(0) : dernier("profils", "updated_at"),
  ]);
  // Fiches ajoutées ou modifiées, CV analysés depuis le dernier calcul : classement refait, au plus toutes les 30 minutes.
  const dernierChangement = Math.max(ficheModifiee, profilModifie);
  const parMission = new Map((lignes ?? []).map((l) => [l.mission_id as string, l]));
  const { matchingV3Actif, VERSION_MOTEUR_V3 } = await import("./v3");
  const version = (await matchingV3Actif(supabase)) ? VERSION_MOTEUR_V3 : (await matchingV2Actif(supabase)) ? VERSION_MOTEUR_V2 : VERSION_MOTEUR;
  const aFaire = (missions ?? []).map((m) => ({ id: m.id as string, l: parMission.get(m.id) }))
    .filter(({ l }) => {
      if (!l?.calcule_le || l.a_recalculer || l.version !== version) return true;
      const calcule = Date.parse(l.calcule_le);
      return Date.now() - calcule > AGE_MAX_MS || (dernierChangement > calcule && Date.now() - calcule > DELAI_CHANGEMENTS_MS);
    })
    // Jamais calculées d'abord, puis les demandes les plus anciennes.
    .sort((a, b) => Number(!!a.l?.calcule_le) - Number(!!b.l?.calcule_le) || Date.parse(a.l?.demande_le ?? "1970") - Date.parse(b.l?.demande_le ?? "1970"));
  let recalcules = 0;
  const erreurs: string[] = [];
  for (const { id } of aFaire) {
    if (Date.now() - debut > budgetMs) break;
    try { await calculerEtRanger(id, supabase); recalcules++; }
    catch (e) { erreurs.push(`${id.slice(0, 8)} : ${(e as Error).message.slice(0, 120)}`); }
  }
  return { recalcules, restants: aFaire.length - recalcules - erreurs.length, erreurs };
}

/** Les premiers profils (10 au plus) de plusieurs missions, en une lecture légère (tableau de bord). */
export async function premiersProfils(supabase: SupabaseClient, missionIds: string[]): Promise<Map<string, LigneClassement[]>> {
  if (!missionIds.length) return new Map();
  const { data } = await supabase.from("classements_mission").select("mission_id, premiers").in("mission_id", missionIds).not("calcule_le", "is", null);
  return new Map((data ?? []).map((r) => [r.mission_id as string, (r.premiers ?? []) as LigneClassement[]]));
}

/**
 * Aperçu du matching v2 (« mise en ligne invisible ») : calculé à côté pour les missions suivies qui n'en ont pas encore,
 * sans toucher aux classements affichés. Rangé dans apercu_matching (critères, nombre d'éligibles, 5 premiers, profils proches).
 */
export async function calculerApercus(supabase: SupabaseClient, budgetMs = 90_000): Promise<{ calcules: number; restants: number }> {
  const debut = Date.now();
  if (await matchingV2Actif(supabase)) return { calcules: 0, restants: 0 };
  const [{ data: missions }, { data: faits }] = await Promise.all([
    supabase.from("missions").select("id").in("statut", STATUTS_SUIVIS),
    supabase.from("apercu_matching").select("mission_id").not("calcule_le", "is", null),
  ]);
  const dejaFaits = new Set((faits ?? []).map((f) => f.mission_id as string));
  const aFaire = (missions ?? []).map((m) => m.id as string).filter((id) => !dejaFaits.has(id));
  let calcules = 0;
  for (const id of aFaire) {
    if (Date.now() - debut > budgetMs) break;
    try {
      const lignes = await classerMission(supabase, id, { v2: true, enregistrerAvis: false });
      const { data: m } = await supabase.from("missions").select("criteres_matching").eq("id", id).maybeSingle();
      const nom = (l: LigneClassement) => `${l.prenom === "—" ? "" : l.prenom} ${l.nom}`.trim();
      await supabase.from("apercu_matching").upsert({
        mission_id: id, criteres: m?.criteres_matching ?? null, calcule_le: new Date().toISOString(), erreur: null,
        eligibles: lignes.filter((l) => l.eligible && !l.resultat.elimine).length,
        premiers: lignes.filter(estPertinent).slice(0, 5).map((l) => ({ id: l.consultant_id, nom: nom(l), poste: l.intitule_poste, note: l.avisIA?.note ?? null, raison: l.avisIA?.raison ?? null })),
        proches: lignes.filter((l) => l.eligible === false && l.manques?.length).slice(0, 5).map((l) => ({ id: l.consultant_id, nom: nom(l), poste: l.intitule_poste, manques: l.manques })),
      });
      calcules++;
    } catch (e) {
      await supabase.from("apercu_matching").upsert({ mission_id: id, erreur: (e as Error).message.slice(0, 300), calcule_le: null });
    }
  }
  return { calcules, restants: aFaire.length - calcules };
}

/** Empreintes de sens des consultants, recalculées seulement quand quelque chose a changé depuis la dernière vérification. */
async function empreintesSiChangement(supabase: SupabaseClient): Promise<void> {
  const dernier = (table: string) => supabase.from(table).select("updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle()
    .then((r) => Date.parse(String((r.data as { updated_at?: string } | null)?.updated_at ?? "1970-01-01")));
  const [changement, { data: marque }] = await Promise.all([
    Promise.all(["consultants", "profils", "consultant_competences", "documents", "tableau_lignes"].map(dernier)).then((t) => Math.max(...t)),
    supabase.from("reglages").select("valeur").eq("cle", "empreintes_verifiees_le").maybeSingle(),
  ]);
  const verifie = Date.parse(String(marque?.valeur ?? "1970-01-01"));
  if (changement <= verifie) return;
  const debutVerification = new Date().toISOString();
  const r = await calculerEmpreintesConsultants(supabase, 60_000);
  // Tout est à jour : la vérification suivante n'aura lieu qu'après un nouveau changement.
  if (!r.restantes) await supabase.from("reglages").upsert({ cle: "empreintes_verifiees_le", valeur: debutVerification });
}

/** Une page du classement complet d'une mission (50 profils), avec le nom, le poste et la disponibilité. */
export async function pageClassementComplet(supabase: SupabaseClient, missionId: string, page: number, parPage = 50): Promise<{
  total: number; lignes: { rang: number; id: string; pourcentage: number; lu: boolean; prenom: string; nom: string; poste: string | null; disponibilite: string | null }[];
}> {
  const debut = page * parPage;
  const { data } = await supabase.from("classements_mission").select("ordre").eq("mission_id", missionId).maybeSingle();
  const ordre = ((data?.ordre ?? []) as [string, number, number][]);
  const tranche = ordre.slice(debut, debut + parPage);
  if (!tranche.length) return { total: ordre.length, lignes: [] };
  const { data: fiches } = await supabase.from("consultants").select("id, prenom, nom, intitule_poste, disponibilite").in("id", tranche.map((t) => t[0]));
  const parId = new Map((fiches ?? []).map((f) => [f.id as string, f]));
  return {
    total: ordre.length,
    lignes: tranche.map(([id, pourcentage, lu], i) => {
      const f = parId.get(id);
      return { rang: debut + i + 1, id, pourcentage, lu: lu === 1, prenom: f?.prenom ?? "", nom: f?.nom ?? "", poste: (f?.intitule_poste as string | null) ?? null, disponibilite: (f?.disponibilite as string | null) ?? null };
    }).filter((l) => l.nom),
  };
}

/**
 * Passage du nouveau matching (toutes les 10 minutes) :
 * 1. une fois : anciens classements v3 reconstruits avec leurs vraies notes (décision 5B, sans IA) ;
 * 2. missions de « Missions en cours » pas encore lues (ou lecture incomplète) : lues une fois ;
 * 3. nouveaux CV découpés : comparés à toutes les missions ouvertes déjà lues (3B).
 * Une lecture complète ne démarre que s'il reste assez de temps (elle peut durer 2 à 3 minutes).
 */
async function passageV4(supabase: SupabaseClient, budgetMs: number): Promise<{ recalcules: number; restants: number; erreurs: string[]; nouveauxCV: number }> {
  const debut = Date.now();
  const v4 = await import("./v4");
  await empreintesSiChangement(supabase).catch((e) => console.error("Empreintes :", (e as Error).message));
  const erreurs: string[] = [];
  const [{ data: missions }, { data: lignes }, { data: marque }] = await Promise.all([
    supabase.from("missions").select("id, trello_colonne").in("statut", STATUTS_SUIVIS),
    supabase.from("classements_mission").select("mission_id, calcule_le, version, a_recalculer, cv_verifies_le"),
    supabase.from("reglages").select("valeur").eq("cle", "anciennes_notes_reconstruites").maybeSingle(),
  ]);
  const parMission = new Map((lignes ?? []).map((l) => [l.mission_id as string, l]));
  // Rythme (décision du 24/11/2026) : chantier = tout, à chaque passage ; ensuite, lectures des missions nouvelles une fois par
  // heure de 8 h à 19 h (passage de la première dizaine de minutes), nouveaux CV une seule fois la nuit (passage de 22 h).
  const { data: chantier } = await supabase.from("reglages").select("valeur").eq("cle", "matching_chantier_jusqu").maybeSingle();
  const enChantier = Date.now() < Date.parse(String(chantier?.valeur ?? "1970-01-01"));
  const paris = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).split(":").map(Number);
  const debutHeure = paris[1] < 10;
  const fairelectures = enChantier || (debutHeure && paris[0] >= 8 && paris[0] <= 19);
  const faireNouveauxCV = enChantier || (debutHeure && paris[0] === 22);
  // 1. Décision 5B (une seule fois).
  if (marque?.valeur !== true) {
    for (const l of lignes ?? []) {
      if (l.version !== "2026-11-23.2-v3-ia") continue;
      try { await v4.reconstruireAnciennesNotes(supabase, l.mission_id as string); } catch (e) { erreurs.push(`5B ${String(l.mission_id).slice(0, 8)} : ${(e as Error).message.slice(0, 100)}`); }
    }
    if (!erreurs.length) await supabase.from("reglages").upsert({ cle: "anciennes_notes_reconstruites", valeur: true });
  }
  // 2. Lectures complètes (une fois par mission).
  const aLire = !fairelectures ? [] : (missions ?? []).filter((m) => {
    const l = parMission.get(m.id as string);
    return v4.aLire(m.trello_colonne as string | null) && (l?.version !== v4.VERSION_MOTEUR_V4 || l?.a_recalculer);
  });
  let recalcules = 0;
  for (const m of aLire) {
    if (Date.now() - debut > Math.min(budgetMs, 60_000)) break;
    try { await v4.lireMissionV4(supabase, m.id as string); recalcules++; }
    catch (e) {
      erreurs.push(`${String(m.id).slice(0, 8)} : ${(e as Error).message.slice(0, 120)}`);
      await supabase.from("classements_mission").update({ erreur: (e as Error).message.slice(0, 300) }).eq("mission_id", m.id);
    }
  }
  // 3. Nouveaux CV comparés aux missions déjà lues.
  let nouveauxCV = 0;
  const { data: dernier } = await supabase.from("dossiers_cv").select("updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const dernierCV = Date.parse(String(dernier?.updated_at ?? "1970-01-01"));
  for (const m of faireNouveauxCV ? missions ?? [] : []) {
    if (Date.now() - debut > budgetMs) break;
    const l = parMission.get(m.id as string);
    if (!v4.aLire(m.trello_colonne as string | null) || l?.version !== v4.VERSION_MOTEUR_V4 || !l?.calcule_le || aLire.some((x) => x.id === m.id)) continue;
    const depuis = (l.cv_verifies_le ?? l.calcule_le) as string;
    if (Date.parse(depuis) >= dernierCV) continue;
    try { nouveauxCV += await v4.comparerNouveauxCV(supabase, m.id as string, depuis); }
    catch (e) { erreurs.push(`nouveaux CV ${String(m.id).slice(0, 8)} : ${(e as Error).message.slice(0, 100)}`); }
  }
  return { recalcules, restants: aLire.length - recalcules, erreurs, nouveauxCV };
}

