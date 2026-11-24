import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clientSupabaseAdmin } from "@/lib/supabase/admin";
import { chargerTableau, type FiltreTableau } from "./chargement";
import { normaliserRecherche, valeurEcran } from "./modele";

/**
 * Projection de lecture de l'écran Consultants (table tableau_vue) : chaque ligne affichée, préparée à l'avance
 * (valeurs affichées, texte cherchable, repères des filtres rapides, liens des CV). L'écran n'en lit qu'une page.
 * Mise à jour après chaque modification (fiche, cellule, import, synchronisations) et toutes les 10 minutes par sécurité :
 * seules les lignes dont le contenu a changé sont réécrites (empreinte), les lignes disparues sont retirées.
 */
let enCours: Promise<BilanProjection> | null = null;
export interface BilanProjection { lignes: number; ecrites: number; retirees: number; dureeMs: number }

export function actualiserProjection(supabase: SupabaseClient = clientSupabaseAdmin()): Promise<BilanProjection> {
  // Une seule mise à jour à la fois sur ce serveur : les demandes rapprochées attendent la même.
  enCours ??= construire(supabase).finally(() => { enCours = null; });
  return enCours;
}

/**
 * Vitesse (25/11/2026) : après la modification de quelques fiches, seules leurs lignes sont recalculées (même résultat
 * que la mise à jour complète, qui relisait toute la base à chaque enregistrement). Fiche sans ligne encore (nouvelle) ou
 * cas inattendu : mise à jour complète, comme avant.
 */
export async function actualiserProjectionConsultants(ids: string[], supabase: SupabaseClient = clientSupabaseAdmin()): Promise<BilanProjection> {
  const uniques = [...new Set(ids.filter(Boolean))];
  if (!uniques.length) return actualiserProjection(supabase);
  const { data: existantes } = await supabase.from("tableau_vue").select("id, position, consultant_id").in("consultant_id", uniques);
  const avecLigne = new Set((existantes ?? []).map((e) => e.consultant_id as string));
  if (uniques.some((id) => !avecLigne.has(id))) return actualiserProjection(supabase);
  const positionsHorsExcel = new Map((existantes ?? []).map((e) => [e.id as string, e.position as number]));
  const r = await construire(supabase, { ids: uniques, positionsHorsExcel });
  return r ?? actualiserProjection(supabase);
}

async function construire(supabase: SupabaseClient): Promise<BilanProjection>;
async function construire(supabase: SupabaseClient, filtre: FiltreTableau): Promise<BilanProjection | null>;
async function construire(supabase: SupabaseClient, filtre?: FiltreTableau): Promise<BilanProjection | null> {
  const debut = Date.now();
  const d = await chargerTableau(supabase, filtre);
  if (!d) return filtre ? null : { lignes: 0, ecrites: 0, retirees: 0, dureeMs: Date.now() - debut };
  const lignes = d.lignes.map((l) => {
    const affiche = Object.fromEntries(Object.entries(l.valeurs).map(([c, v]) => [c, valeurEcran(d.champs[c], v)]));
    // Même texte cherchable que l'ancien écran : valeur saisie + valeur affichée de chaque colonne + compétences du CV.
    const recherche = normaliserRecherche([...Object.entries(l.valeurs).map(([c, v]) => `${v} ${affiche[c]}`), l.recherche ?? ""].join(" "));
    const m = l.meta;
    const ligne = {
      id: l.id, position: l.position, consultant_id: l.consultant_id, valeurs: l.valeurs, affiche, recherche,
      chiffres: recherche.replace(/\D/g, ""), dispo: m?.dispo ?? null, dispo_le: m?.dispoLe ?? null, dispo_maj: m?.dispoMaj ?? null,
      cree_le: m?.creeLe ?? null, source: m?.source ?? null, cv_analyse: !!m?.cvAnalyse,
      documents: (l.consultant_id && d.documents[l.consultant_id]) || {},
    };
    return { ...ligne, empreinte: createHash("sha1").update(JSON.stringify(ligne)).digest("base64") };
  });

  // Empreintes actuelles en une seule lecture (fonction de la base) ; mise à jour ciblée : celles de ces fiches seulement.
  let existantes: { id: string; empreinte: string }[];
  if (filtre) {
    const { data: e, error } = await supabase.from("tableau_vue").select("id, empreinte").in("consultant_id", filtre.ids);
    if (error) throw new Error(`Projection du tableau : ${error.message}`);
    existantes = (e ?? []) as { id: string; empreinte: string }[];
  } else {
    const { data: emp, error: errEmp } = await supabase.rpc("tableau_vue_empreintes");
    if (errEmp) throw new Error(`Projection du tableau : ${errEmp.message}`);
    existantes = Object.entries((emp ?? {}) as Record<string, string>).map(([id, empreinte]) => ({ id, empreinte }));
  }
  const avant = new Map(existantes.map((e) => [e.id, e.empreinte]));
  const aEcrire = lignes.filter((l) => avant.get(l.id) !== l.empreinte);
  for (let i = 0; i < aEcrire.length; i += 400) {
    const { error } = await supabase.from("tableau_vue").upsert(aEcrire.slice(i, i + 400));
    if (error) throw new Error(`Projection du tableau : ${error.message}`);
  }
  const presentes = new Set(lignes.map((l) => l.id));
  const aRetirer = existantes.map((e) => e.id).filter((id) => !presentes.has(id));
  for (let i = 0; i < aRetirer.length; i += 200) await supabase.from("tableau_vue").delete().in("id", aRetirer.slice(i, i + 200));
  return { lignes: lignes.length, ecrites: aEcrire.length, retirees: aRetirer.length, dureeMs: Date.now() - debut };
}
