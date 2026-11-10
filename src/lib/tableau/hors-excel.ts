import { champsParEntete, COLONNE_DOMAINE, type ChampFiche } from "@/lib/import/excel";
import { formaterTelephone } from "@/lib/metier/telephone";
import type { LigneTableau } from "./modele";

/** Préfixe des lignes calculées (fiches créées hors Excel) : elles n'existent pas dans tableau_lignes. */
export const PREFIXE_HORS_EXCEL = "fiche:";
export const DOMAINES_HORS_EXCEL: Record<string, string> = { email: "Ajoutés par email", sharepoint: "Ajoutés depuis SharePoint", manuel: "Ajoutés à la main", api: "Ajoutés par l'API" };

export interface FicheHorsExcel {
  id: string; source: string; prenom: string; nom: string; trigramme: string; email: string | null; email_2: string | null;
  telephone_e164: string | null; telephone_brut: string | null; intitule_poste: string | null; disponibilite: string | null;
  disponible_le: string | null; disponibilite_maj_le: string | null; localisation: string | null; notes: string | null; statut: string;
  experience: string | null; tjm_salaire: string | null; linkedin: string | null; cv_lien: string | null; commentaire_email: string | null;
}

/**
 * Fiches créées hors du fichier Excel (candidatures email, CV SharePoint…) présentées comme des lignes du tableau,
 * dans les colonnes de l'Excel. Elles ne sont pas stockées dans le tableau : la synchronisation de nuit de l'Excel
 * (qui réécrit le tableau) ne peut donc pas les effacer. On les modifie depuis la fiche.
 */
export function lignesHorsExcel(fiches: FicheHorsExcel[], entetes: string[], premierePosition: number): LigneTableau[] {
  const colonneDe = new Map<ChampFiche, string>();
  for (const [entete, champ] of Object.entries(champsParEntete(entetes, entetes))) if (!colonneDe.has(champ)) colonneDe.set(champ, entete);
  return fiches.map((f, i) => {
    const valeurs: Record<string, string> = {};
    const poser = (champ: ChampFiche, v: string | null | undefined) => {
      const col = colonneDe.get(champ);
      if (col && v) valeurs[col] = v;
    };
    poser("prenom", f.prenom); poser("nom", f.nom); poser("trigramme", f.trigramme); poser("email", f.email);
    poser("email_2", f.email_2); poser("telephone", formaterTelephone(f.telephone_e164) || f.telephone_brut);
    poser("intitule_poste", f.intitule_poste); poser("disponibilite", f.disponible_le ?? f.disponibilite);
    poser("localisation", f.localisation); poser("notes", f.notes); poser("statut", f.statut); poser("experience", f.experience);
    poser("tjm_salaire", f.tjm_salaire); poser("linkedin", f.linkedin); poser("cv_lien", f.cv_lien);
    poser("commentaire_email", f.commentaire_email); poser("date_maj", f.disponibilite_maj_le?.slice(0, 10));
    if (entetes.includes(COLONNE_DOMAINE)) valeurs[COLONNE_DOMAINE] = DOMAINES_HORS_EXCEL[f.source] ?? "Ajoutés hors Excel";
    return { id: `${PREFIXE_HORS_EXCEL}${f.id}`, position: premierePosition + i, consultant_id: f.id, valeurs };
  });
}
