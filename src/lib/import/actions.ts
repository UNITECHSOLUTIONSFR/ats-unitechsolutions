"use server";

import { revalidatePath } from "next/cache";
import { invaliderTableau } from "@/lib/tableau/cache";
import { exigerAdmin } from "@/lib/acces-admin";
import { lireOnglets, preparerImport, type OngletLu } from "./excel";
import { importerAnnexe, ongletUnique, prevoirAnnexe, rattacherColonnes, type BilanAnnexe, type ColonneAnnexe, type PrevisionAnnexe } from "./annexe";

export interface EtatImport {
  etape: "depart" | "apercu" | "termine" | "erreur";
  nomFichier?: string;
  colonnes?: ColonneAnnexe[];
  prevision?: PrevisionAnnexe;
  bilan?: BilanAnnexe;
  message?: string;
}

const TAILLE_MAX = 4 * 1024 * 1024 - 50_000;

/**
 * Import d'un fichier Excel : son contenu s'ajoute à la base, rien n'est écrasé.
 * 1re action : analyse et prévision, sans rien écrire. 2e action (confirmer) : ajout.
 */
export async function traiterFichierExcel(_etat: EtatImport, formData: FormData): Promise<EtatImport> {
  const { utilisateur, supabase } = await exigerAdmin();
  const fichier = formData.get("fichier");
  const confirmer = formData.get("confirmer") === "oui";
  const aAjouter = formData.getAll("ajouter").map(String);
  if (!(fichier instanceof File) || fichier.size === 0) return { etape: "erreur", message: "Choisissez un fichier .xlsx." };
  if (!fichier.name.toLowerCase().endsWith(".xlsx")) return { etape: "erreur", message: "Le fichier doit être au format .xlsx." };
  if (fichier.size > TAILLE_MAX) return { etape: "erreur", message: "Fichier trop volumineux (4 Mo maximum)." };

  let onglets: OngletLu[];
  try {
    onglets = await lireOnglets(new Uint8Array(await fichier.arrayBuffer()));
  } catch {
    return { etape: "erreur", message: "Fichier illisible. Vérifiez qu'il s'agit bien d'un fichier .xlsx." };
  }
  if (!onglets.length) return { etape: "erreur", message: "Le fichier ne contient aucun onglet." };
  const onglet = ongletUnique(onglets);

  const { data: principal } = await supabase.from("tableau_onglets").select("entetes").eq("principal", true).maybeSingle();
  if (!principal) return { etape: "erreur", message: "La base n'a pas encore de tableau de suivi." };
  const colonnes = rattacherColonnes(onglet.entetes, principal.entetes);
  if (!colonnes.some((c) => c.champ === "nom" || c.champ === "nom_complet")) {
    return { etape: "erreur", message: "Aucune colonne « Nom » reconnue dans le fichier : import impossible." };
  }
  const { fiches, rapport } = preparerImport(onglet.entetes, onglet.lignes);

  if (!confirmer) {
    const prevision = await prevoirAnnexe(supabase, fiches, rapport);
    return { etape: "apercu", nomFichier: fichier.name, colonnes, prevision };
  }

  const { data: execution } = await supabase
    .from("executions")
    .insert({ type: "import_excel", rapport: { fichier: fichier.name, mode: "ajout", lignes: rapport.lignesLues }, elements_traites: fiches.length })
    .select("id")
    .single();
  try {
    const bilan = await importerAnnexe(supabase, onglet, colonnes, aAjouter, utilisateur.id, fichier.name);
    if (execution) {
      await supabase.from("executions").update({
        fin: new Date().toISOString(), statut: bilan.erreurs.length ? "termine_avec_erreurs" : "termine",
        erreurs: bilan.erreurs.length, rapport: { fichier: fichier.name, mode: "ajout", lignes: rapport.lignesLues, bilan },
      }).eq("id", execution.id);
    }
    await supabase.from("journal_acces").insert({ utilisateur_id: utilisateur.id, action: "modification", details: { import_fichier: fichier.name, crees: bilan.crees, completees: bilan.completees } });
    invaliderTableau();
    revalidatePath("/");
    revalidatePath("/consultants");
    return { etape: "termine", nomFichier: fichier.name, colonnes, bilan };
  } catch (e) {
    if (execution) await supabase.from("executions").update({ fin: new Date().toISOString(), statut: "echec" }).eq("id", execution.id);
    return { etape: "erreur", message: `Import interrompu : ${(e as Error).message}` };
  }
}
