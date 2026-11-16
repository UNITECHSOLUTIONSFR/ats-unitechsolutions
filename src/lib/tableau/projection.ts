import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clientSupabaseAdmin } from "@/lib/supabase/admin";
import { lireTout } from "@/lib/supabase/pages";
import { chargerTableau } from "./chargement";
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

async function construire(supabase: SupabaseClient): Promise<BilanProjection> {
  const debut = Date.now();
  const d = await chargerTableau(supabase);
  if (!d) return { lignes: 0, ecrites: 0, retirees: 0, dureeMs: Date.now() - debut };
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

  const existantes = await lireTout<{ id: string; empreinte: string }>((a, b) => supabase.from("tableau_vue").select("id, empreinte").range(a, b));
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
