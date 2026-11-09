import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FicheImport } from "./excel";
import { normaliserNomPersonne } from "@/lib/metier/texte";

export interface BilanEcriture {
  crees: number;
  misAJour: number;
  alertes: number;
  erreurs: string[];
}

function statutDepuisTexte(t: string | null): "candidat" | "consultant" | "en_mission" | "inactif" {
  const s = (t ?? "").toLowerCase();
  if (/mission/.test(s)) return "en_mission";
  if (/inactif|parti|archiv/.test(s)) return "inactif";
  if (/consultant|salari|interne|cdi/.test(s)) return "consultant";
  return "candidat";
}

/**
 * Écrit les fiches dans la base. Dédoublonnage avec l'existant : email, puis téléphone.
 * Un doublon met à jour les champs vides et garde l'historique ; un même nom avec des coordonnées
 * différentes crée une alerte « doublon possible ». Jamais de seconde fiche pour la même personne.
 */
export async function ecrireFiches(supabase: SupabaseClient, fiches: FicheImport[], utilisateurId: string): Promise<BilanEcriture> {
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
    };
    const existant = (f.email && parEmail.get(f.email)) || (f.telephone_e164 && parTel.get(f.telephone_e164)) || null;

    if (existant) {
      const modifications: Record<string, { avant: unknown; apres: unknown }> = {};
      const maj: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(valeurs)) {
        if (k === "statut" || v === null || v === "") continue;
        if (existant[k] === null || existant[k] === undefined || existant[k] === "") {
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
            consultant_id: existant.id, source: "import_excel", modifications, par: utilisateurId,
          });
        }
      }
      continue;
    }

    const homonymes = parNom.get(normaliserNomPersonne(f.prenom, f.nom));
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
