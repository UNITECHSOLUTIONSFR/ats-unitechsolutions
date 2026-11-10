import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FicheImport } from "./excel";
import { normaliserNomPersonne } from "@/lib/metier/texte";
import { cleStable, statutDepuisTexte } from "@/lib/tableau/modele";

export interface BilanEcriture {
  crees: number;
  misAJour: number;
  alertes: number;
  erreurs: string[];
}

/**
 * Écrit les fiches dans la base (import ponctuel ou synchronisation de nuit avec « l'Excel fait foi »). Dédoublonnage avec l'existant : même ligne d'origine du fichier
 * (réimport du même fichier, y compris sans email ni téléphone), puis email, puis téléphone.
 * Un doublon met à jour les champs vides et garde l'historique ; un même nom avec des coordonnées
 * différentes crée une alerte « doublon possible ». Jamais de seconde fiche pour la même personne.
 */
export async function ecrireFiches(
  supabase: SupabaseClient,
  fiches: FicheImport[],
  utilisateurId: string | null,
  options: { excelFaitFoi?: boolean } = {},
): Promise<BilanEcriture> {
  const bilan: BilanEcriture = { crees: 0, misAJour: 0, alertes: 0, erreurs: [] };
  const existants: { id: string; prenom: string; nom: string; email: string | null; telephone_e164: string | null; [k: string]: unknown }[] = [];
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await supabase.from("consultants").select("*").range(debut, debut + 999);
    if (error) throw new Error(error.message);
    existants.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const parEmail = new Map(existants.filter((e) => e.email).map((e) => [e.email!, e]));
  const parTel = new Map(existants.filter((e) => e.telephone_e164).map((e) => [e.telephone_e164!, e]));
  const parLigne = new Map<string, (typeof existants)[number]>();
  for (const e of existants) {
    for (const d of (e.donnees_excel as { ligne: number; valeurs: Record<string, string> }[] | undefined) ?? []) {
      parLigne.set(cleStable(d.ligne, d.valeurs), e);
    }
  }
  // Fiches de l'ATS ajoutées au fichier Excel par l'outil : retrouvées par prénom + nom + trigramme si elles n'ont ni email ni téléphone.
  const parExport = new Map(existants.filter((e) => e.ajoute_excel_le).map((e) => [`${normaliserNomPersonne(e.prenom, e.nom)}|${e.trigramme}`, e]));
  const parNom = new Map<string, string[]>();
  for (const e of existants) {
    const n = normaliserNomPersonne(e.prenom, e.nom);
    parNom.set(n, [...(parNom.get(n) ?? []), e.id]);
  }

  const maintenant = new Date().toISOString();
  const aCreer: Record<string, unknown>[] = [];
  const alertes: Record<string, unknown>[] = [];

  for (const f of fiches) {
    const valeurs: Record<string, unknown> = {
      prenom: f.prenom || "—",
      nom: f.nom,
      trigramme: f.trigramme,
      email: f.email,
      telephone_e164: f.telephone_e164,
      telephone_brut: f.telephone_brut,
      intitule_poste: f.intitule_poste,
      disponibilite: f.disponibilite,
      disponible_le: f.disponible_le,
      // Date de mise à jour de l'Excel si elle existe (sert à l'alerte « disponibilité de plus de 3 mois »)
      disponibilite_maj_le: f.disponibilite || f.disponible_le ? (f.date_maj ?? maintenant) : null,
      localisation: f.localisation,
      notes: f.notes,
      statut: statutDepuisTexte(f.statut_texte),
      experience: f.experience,
      tjm_salaire: f.tjm_salaire,
      linkedin: f.linkedin,
      cv_lien: f.cv_lien,
      email_2: f.email_2,
      commentaire_email: f.commentaire_email,
    };
    const existant =
      f.donnees_excel.map((d) => parLigne.get(cleStable(d.ligne, d.valeurs))).find(Boolean) ||
      (f.email && parEmail.get(f.email)) ||
      (f.telephone_e164 && parTel.get(f.telephone_e164)) ||
      parExport.get(`${normaliserNomPersonne(f.prenom, f.nom)}|${f.trigramme}`) ||
      null;

    if (existant) {
      const modifications: Record<string, { avant: unknown; apres: unknown }> = {};
      const maj: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(valeurs)) {
        if (v === null || v === "") continue;
        if (k === "statut" && !options.excelFaitFoi) continue;
        const vide = existant[k] === null || existant[k] === undefined || existant[k] === "";
        // Synchronisation pendant la transition : l'Excel fait foi, ses valeurs remplacent celles de la fiche.
        const remplace = options.excelFaitFoi && String(existant[k] ?? "") !== String(v);
        if (k === "email" && remplace && parEmail.get(String(v)) && parEmail.get(String(v))!.id !== existant.id) continue; // email déjà pris
        if (vide || remplace) {
          maj[k] = v;
          modifications[k] = { avant: existant[k] ?? null, apres: v };
        }
      }
      // Les lignes Excel d'origine sont toujours ajoutées (jamais de doublon de ligne en cas de réimport).
      const dejaVues = new Set(((existant.donnees_excel as { ligne: number }[] | undefined) ?? []).map((d) => JSON.stringify(d)));
      const nouvelles = f.donnees_excel.filter((d) => !dejaVues.has(JSON.stringify(d)));
      if (nouvelles.length) maj.donnees_excel = [...((existant.donnees_excel as unknown[]) ?? []), ...nouvelles];
      if (Object.keys(maj).length) {
        const { error } = await supabase.from("consultants").update(maj).eq("id", existant.id);
        if (error) bilan.erreurs.push(`Ligne ${f.ligne} : ${error.message}`);
        else {
          bilan.misAJour++;
          await supabase.from("consultants_historique").insert({
            consultant_id: existant.id, source: options.excelFaitFoi ? "synchro_excel" : "import_excel", modifications, par: utilisateurId,
          });
        }
      }
      continue;
    }

    const homonymes = f.nom ? parNom.get(normaliserNomPersonne(f.prenom, f.nom)) : undefined;
    aCreer.push({ ...valeurs, donnees_excel: f.donnees_excel, source: "import_excel", _ligne: f.ligne, _homonymes: homonymes ?? null });
  }

  for (let i = 0; i < aCreer.length; i += 500) {
    const lot = aCreer.slice(i, i + 500);
    const { data, error } = await supabase
      .from("consultants")
      .insert(lot.map(({ _ligne, _homonymes, ...v }) => (void _ligne, void _homonymes, v)))
      .select("id");
    if (error) {
      bilan.erreurs.push(`Lot à partir de la ligne ${lot[0]._ligne} : ${error.message}`);
      continue;
    }
    bilan.crees += data.length;
    data.forEach((cree, j) => {
      const source = lot[j];
      if (source._homonymes) {
        alertes.push({ type: "doublon_possible", consultant_id: cree.id, details: { ligne_excel: source._ligne, fiches_existantes: source._homonymes } });
      }
      if (!source.nom) {
        alertes.push({ type: "nom_manquant", consultant_id: cree.id, details: { ligne_excel: source._ligne } });
      }
      if (source.telephone_brut) {
        alertes.push({ type: "telephone_invalide", consultant_id: cree.id, details: { ligne_excel: source._ligne, valeur: source.telephone_brut } });
      }
    });
  }

  for (let i = 0; i < alertes.length; i += 500) {
    const { error } = await supabase.from("alertes").insert(alertes.slice(i, i + 500));
    if (!error) bilan.alertes += Math.min(500, alertes.length - i);
  }
  return bilan;
}
