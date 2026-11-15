import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lireTout } from "@/lib/supabase/pages";
import { formaterTelephone } from "@/lib/metier/telephone";
import { normaliserNomPersonne, sansAccents } from "@/lib/metier/texte";
import { champsParEntete, corrigerOngletPrincipal, fusionnerOnglets, preparerImport, valeurAffichee, type ChampFiche, type FicheImport, type OngletLu, type RapportImport } from "./excel";
import { valeursConsultant } from "./ecriture";

/**
 * Import d'un fichier Excel annexe : son contenu S'AJOUTE à la base, rien n'est écrasé ni supprimé.
 * - Chaque colonne du fichier est rattachée à la colonne de la base qui porte le même titre (ou le même sens : « Tél » → « Téléphone »).
 * - Consultant déjà en base (même email, sinon même téléphone) : seules ses cases vides sont remplies.
 * - Nouveau consultant : fiche créée (source « import_annexe ») ; la synchronisation de nuit l'ajoute au fichier Excel d'origine.
 * - Colonne absente de la base : ignorée, sauf si l'administrateur choisit de l'ajouter.
 */

export const REGLAGE_COLONNES_AJOUTEES = "colonnes_ajoutees_tableau";

export interface ColonneAnnexe {
  /** Titre de la colonne dans le fichier. */
  colonne: string;
  /** Colonne de la base qui reçoit les valeurs (null : aucune). */
  cible: string | null;
  /** champ = rattachée à un champ de la fiche ; colonne = même titre dans la base ; nouvelle = absente de la base. */
  type: "champ" | "colonne" | "nouvelle";
  champ?: ChampFiche;
}

export interface PrevisionAnnexe {
  lignesLues: number;
  nouvelles: number;
  completees: number;
  doublonsPossibles: number;
  sansNom: number;
  telephonesInvalides: string[];
  emailsInvalides: string[];
}

export interface BilanAnnexe {
  crees: number;
  completees: number;
  casesRemplies: number;
  alertes: number;
  colonnesAjoutees: string[];
  erreurs: string[];
}

const cle = (s: string) => sansAccents(s).toLowerCase().replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();

/** Les onglets d'un fichier annexe sont réunis en un seul (onglets métier → colonne « Domaine »), comme pour le fichier de suivi. */
export function ongletUnique(onglets: OngletLu[]): OngletLu {
  return corrigerOngletPrincipal(fusionnerOnglets(onglets).onglet);
}

/** Rattache chaque colonne du fichier à une colonne de la base. */
export function rattacherColonnes(entetesFichier: string[], entetesBase: string[]): ColonneAnnexe[] {
  const champsFichier = champsParEntete(entetesFichier, entetesFichier);
  const champsBase = champsParEntete(entetesBase, entetesBase);
  const baseParChamp = new Map<ChampFiche, string>();
  for (const [e, c] of Object.entries(champsBase)) if (!baseParChamp.has(c)) baseParChamp.set(c, e);
  const baseParCle = new Map(entetesBase.map((e) => [cle(e), e]));
  const vues = new Set<string>();
  const r: ColonneAnnexe[] = [];
  for (const colonne of entetesFichier) {
    if (!colonne.trim() || vues.has(colonne)) continue;
    vues.add(colonne);
    const champ = champsFichier[colonne];
    const memeTitre = baseParCle.get(cle(colonne));
    if (champ) r.push({ colonne, champ, type: "champ", cible: memeTitre ?? baseParChamp.get(champ) ?? null });
    else if (memeTitre) r.push({ colonne, type: "colonne", cible: memeTitre });
    else r.push({ colonne, type: "nouvelle", cible: null });
  }
  return r;
}

type Existant = {
  id: string; prenom: string; nom: string; email: string | null; telephone_e164: string | null; source: string;
  ajoute_excel_le: string | null; colonnes_tableau: Record<string, string> | null; excel_maj_en_attente: Record<string, unknown> | null;
  [k: string]: unknown;
};

const CHAMPS_FICHE = "id, prenom, nom, trigramme, email, telephone_e164, telephone_brut, intitule_poste, disponibilite, disponible_le, disponibilite_maj_le, localisation, notes, statut, experience, tjm_salaire, linkedin, cv_lien, email_2, commentaire_email, source, ajoute_excel_le, colonnes_tableau, excel_maj_en_attente";

async function chargerExistants(supabase: SupabaseClient) {
  const existants = await lireTout<Existant>((a, b) => supabase.from("consultants").select(CHAMPS_FICHE).order("id").range(a, b));
  const parEmail = new Map(existants.filter((e) => e.email).map((e) => [e.email!, e]));
  const parTel = new Map(existants.filter((e) => e.telephone_e164).map((e) => [e.telephone_e164!, e]));
  const parNom = new Map<string, string[]>();
  for (const e of existants) {
    const n = normaliserNomPersonne(e.prenom, e.nom);
    parNom.set(n, [...(parNom.get(n) ?? []), e.id]);
  }
  const retrouver = (f: FicheImport) => (f.email && parEmail.get(f.email)) || (f.telephone_e164 && parTel.get(f.telephone_e164)) || null;
  return { parEmail, parNom, retrouver };
}

/** Prévision affichée avant l'import (rien n'est écrit). */
export async function prevoirAnnexe(supabase: SupabaseClient, fiches: FicheImport[], rapport: RapportImport): Promise<PrevisionAnnexe> {
  const { parNom, retrouver } = await chargerExistants(supabase);
  let nouvelles = 0, completees = 0, doublonsPossibles = 0;
  for (const f of fiches) {
    if (retrouver(f)) completees++;
    else {
      nouvelles++;
      if (f.nom && parNom.has(normaliserNomPersonne(f.prenom, f.nom))) doublonsPossibles++;
    }
  }
  return {
    lignesLues: rapport.lignesLues, nouvelles, completees, doublonsPossibles: doublonsPossibles + rapport.doublonsPossibles.length,
    sansNom: rapport.rejets.length,
    telephonesInvalides: rapport.telephonesInvalides.map((t) => `Ligne ${t.ligne} : ${t.valeur}`),
    emailsInvalides: rapport.emailsInvalides.map((t) => `Ligne ${t.ligne} : ${t.valeur}`),
  };
}

/** Valeurs de la personne dans le fichier, colonne de la base → valeur affichée (plusieurs lignes fusionnées : la 1re non vide). */
function cellulesDeLaFiche(f: FicheImport, onglet: OngletLu, colonnes: ColonneAnnexe[]): Record<string, string> {
  const r: Record<string, string> = {};
  const indice = new Map(onglet.entetes.map((e, j) => [e, j]));
  const parLigne = new Map(onglet.lignes.map((l, i) => [i + 2, l]));
  for (const c of colonnes) {
    if (!c.cible) continue;
    if (c.champ === "telephone" && f.telephone_e164) { r[c.cible] = formaterTelephone(f.telephone_e164); continue; }
    for (const d of f.donnees_excel) {
      const v = valeurAffichee(parLigne.get(d.ligne)?.[indice.get(c.colonne) ?? -1]);
      if (v) { r[c.cible] = v; break; }
    }
  }
  return r;
}

/**
 * Ajoute le contenu du fichier à la base. `colonnesAAjouter` : colonnes « nouvelles » que l'administrateur a choisi d'ajouter.
 * Les cases remplies sur des personnes déjà présentes dans le fichier de suivi sont recopiées dans l'Excel d'origine la nuit
 * (uniquement dans des cases vides : rien n'y est remplacé).
 */
export async function importerAnnexe(
  supabase: SupabaseClient,
  onglet: OngletLu,
  colonnesFichier: ColonneAnnexe[],
  colonnesAAjouter: string[],
  utilisateurId: string,
  nomFichier: string,
): Promise<BilanAnnexe> {
  const bilan: BilanAnnexe = { crees: 0, completees: 0, casesRemplies: 0, alertes: 0, colonnesAjoutees: [], erreurs: [] };
  const { fiches } = preparerImport(onglet.entetes, onglet.lignes);

  // 1. Colonnes ajoutées : en fin de tableau, mémorisées pour être créées aussi dans l'Excel d'origine.
  const { data: principal } = await supabase.from("tableau_onglets").select("id, entetes").eq("principal", true).maybeSingle();
  if (!principal) throw new Error("tableau de suivi introuvable");
  const entetes: string[] = [...principal.entetes];
  const colonnes = colonnesFichier.map((c) => ({ ...c }));
  for (const c of colonnes) {
    if (c.type !== "nouvelle" || !colonnesAAjouter.includes(c.colonne)) continue;
    const titre = c.colonne.trim();
    if (!entetes.includes(titre)) { entetes.push(titre); bilan.colonnesAjoutees.push(titre); }
    c.cible = titre;
  }
  if (bilan.colonnesAjoutees.length) {
    const { error } = await supabase.from("tableau_onglets").update({ entetes }).eq("id", principal.id);
    if (error) throw new Error(error.message);
    const { data: reglage } = await supabase.from("reglages").select("valeur").eq("cle", REGLAGE_COLONNES_AJOUTEES).maybeSingle();
    const deja = Array.isArray(reglage?.valeur) ? (reglage!.valeur as string[]) : [];
    await supabase.from("reglages").upsert({ cle: REGLAGE_COLONNES_AJOUTEES, valeur: [...new Set([...deja, ...bilan.colonnesAjoutees])], updated_at: new Date().toISOString() });
  }
  const champsBase = champsParEntete(entetes, entetes);

  // 2. Fiches.
  const { parEmail, parNom, retrouver } = await chargerExistants(supabase);
  const maintenant = new Date().toISOString();
  const aCreer: { valeurs: Record<string, unknown>; ligne: number; homonymes: string[] | null }[] = [];
  const completees: { existant: Existant; cellules: Record<string, string> }[] = [];

  for (const f of fiches) {
    const cellules = cellulesDeLaFiche(f, onglet, colonnes);
    const valeurs = valeursConsultant(f, maintenant);
    const existant = retrouver(f);
    if (!existant) {
      // Colonnes sans champ dédié sur la fiche : gardées dans « colonnes_tableau » (affichées dans le tableau, recopiées dans l'Excel).
      const libres = Object.fromEntries(Object.entries(cellules).filter(([e]) => !champsBase[e]));
      aCreer.push({
        valeurs: { ...valeurs, source: "import_annexe", colonnes_tableau: libres },
        ligne: f.ligne, homonymes: f.nom ? parNom.get(normaliserNomPersonne(f.prenom, f.nom)) ?? null : null,
      });
      continue;
    }
    // Déjà en base : uniquement les cases vides.
    const maj: Record<string, unknown> = {};
    const modifications: Record<string, { avant: unknown; apres: unknown }> = {};
    for (const [k, v] of Object.entries(valeurs)) {
      if (v === null || v === "" || k === "statut" || k === "disponibilite_maj_le" || k === "prenom" || k === "nom" || k === "trigramme") continue;
      if (existant[k] !== null && existant[k] !== undefined && existant[k] !== "") continue;
      if (k === "email" && parEmail.get(String(v)) && parEmail.get(String(v))!.id !== existant.id) continue;
      maj[k] = v;
      modifications[k] = { avant: null, apres: v };
    }
    if ((maj.disponibilite !== undefined || maj.disponible_le !== undefined) && valeurs.disponibilite_maj_le) maj.disponibilite_maj_le = valeurs.disponibilite_maj_le;
    const libres = { ...(existant.colonnes_tableau ?? {}) };
    let libresChangees = false;
    for (const [e, v] of Object.entries(cellules)) {
      if (champsBase[e] || libres[e]) continue;
      libres[e] = v;
      libresChangees = true;
      modifications[e] = { avant: null, apres: v };
    }
    if (libresChangees) maj.colonnes_tableau = libres;
    if (Object.keys(maj).length) {
      const { error } = await supabase.from("consultants").update(maj).eq("id", existant.id);
      if (error) { bilan.erreurs.push(`Ligne ${f.ligne} : ${error.message}`); continue; }
      bilan.completees++;
      await supabase.from("consultants_historique").insert({
        consultant_id: existant.id, source: "import_annexe", modifications: { ...modifications, fichier: { avant: null, apres: nomFichier } }, par: utilisateurId,
      });
    }
    completees.push({ existant, cellules });
  }

  // 3. Personnes déjà dans le fichier de suivi : cases vides de leur ligne remplies dans le tableau, puis dans l'Excel d'origine la nuit.
  const ids = completees.map((c) => c.existant.id);
  const lignes: { id: string; consultant_id: string; valeurs: Record<string, string> }[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from("tableau_lignes").select("id, consultant_id, valeurs").eq("onglet_id", principal.id).in("consultant_id", ids.slice(i, i + 200));
    lignes.push(...((data ?? []) as typeof lignes));
  }
  const lignesPar = new Map<string, typeof lignes>();
  for (const l of lignes) lignesPar.set(l.consultant_id, [...(lignesPar.get(l.consultant_id) ?? []), l]);
  for (const { existant, cellules } of completees) {
    const sesLignes = lignesPar.get(existant.id) ?? [];
    const dansExcel = sesLignes.length > 0 || !!existant.ajoute_excel_le;
    if (!dansExcel) continue; // fiche hors Excel : ajoutée entière au fichier la nuit, avec ses nouvelles valeurs
    const aEcrire: Record<string, string> = {};
    for (const [e, v] of Object.entries(cellules)) {
      if (sesLignes.some((l) => l.valeurs[e])) continue;
      aEcrire[e] = v;
    }
    if (!Object.keys(aEcrire).length) continue;
    for (const l of sesLignes) {
      await supabase.from("tableau_lignes").update({ valeurs: { ...l.valeurs, ...aEcrire } }).eq("id", l.id);
    }
    const attente = (existant.excel_maj_en_attente ?? {}) as { cellules?: Record<string, string> };
    await supabase.from("consultants").update({ excel_maj_en_attente: { ...attente, cellules: { ...(attente.cellules ?? {}), ...aEcrire } } }).eq("id", existant.id);
    bilan.casesRemplies += Object.keys(aEcrire).length;
  }

  // 4. Nouvelles fiches, par lots, avec les alertes habituelles.
  const alertes: Record<string, unknown>[] = [];
  for (let i = 0; i < aCreer.length; i += 500) {
    const lot = aCreer.slice(i, i + 500);
    const { data, error } = await supabase.from("consultants").insert(lot.map((x) => x.valeurs)).select("id");
    if (error) { bilan.erreurs.push(`Lot à partir de la ligne ${lot[0].ligne} : ${error.message}`); continue; }
    bilan.crees += data.length;
    data.forEach((cree, j) => {
      const x = lot[j];
      const details = { fichier: nomFichier, ligne_fichier: x.ligne };
      if (x.homonymes) alertes.push({ type: "doublon_possible", consultant_id: cree.id, details: { ...details, fiches_existantes: x.homonymes } });
      if (!x.valeurs.nom) alertes.push({ type: "nom_manquant", consultant_id: cree.id, details });
      if (x.valeurs.telephone_brut) alertes.push({ type: "telephone_invalide", consultant_id: cree.id, details: { ...details, valeur: x.valeurs.telephone_brut } });
    });
  }
  for (let i = 0; i < alertes.length; i += 500) {
    const { error } = await supabase.from("alertes").insert(alertes.slice(i, i + 500));
    if (!error) bilan.alertes += Math.min(500, alertes.length - i);
  }
  return bilan;
}
