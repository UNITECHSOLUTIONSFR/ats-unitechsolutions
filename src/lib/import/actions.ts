"use server";

import { revalidatePath } from "next/cache";
import { exigerAdmin } from "@/lib/acces-admin";
import { corrigerOngletPrincipal, detecterColonnes, lireOnglets, preparerImport, type OngletLu, type RapportImport } from "./excel";
import { ecrireFiches, type BilanEcriture } from "./ecriture";
import { ecrireTableau, type BilanTableau } from "@/lib/tableau/ecriture";

export interface EtatImport {
  etape: "depart" | "apercu" | "termine" | "erreur";
  nomFichier?: string;
  colonnes?: { champ: string; colonne: string }[];
  rapport?: RapportImport;
  bilan?: BilanEcriture;
  bilanTableau?: BilanTableau;
  /** Onglets du fichier, avec leur nombre de lignes et de colonnes. */
  onglets?: { nom: string; lignes: number; colonnes: number }[];
  message?: string;
}

const TAILLE_MAX = 4 * 1024 * 1024 - 50_000;

/** 1re action : analyse le fichier et affiche le rapport, sans rien écrire. 2e action (confirmer) : importe. */
export async function traiterFichierExcel(_etat: EtatImport, formData: FormData): Promise<EtatImport> {
  const { utilisateur, supabase } = await exigerAdmin();
  const fichier = formData.get("fichier");
  const confirmer = formData.get("confirmer") === "oui";
  if (!(fichier instanceof File) || fichier.size === 0) return { etape: "erreur", message: "Choisissez un fichier .xlsx." };
  if (!fichier.name.toLowerCase().endsWith(".xlsx")) return { etape: "erreur", message: "Le fichier doit être au format .xlsx." };
  if (fichier.size > TAILLE_MAX) return { etape: "erreur", message: "Fichier trop volumineux (4 Mo maximum)." };

  let onglets: OngletLu[];
  try {
    onglets = await lireOnglets(new Uint8Array(await fichier.arrayBuffer()));
  } catch {
    return { etape: "erreur", message: "Fichier illisible. Vérifiez qu'il s'agit bien d'une copie .xlsx du fichier de suivi." };
  }
  if (!onglets.length) return { etape: "erreur", message: "Le fichier ne contient aucun onglet." };
  // Nettoyage des cases email de l'onglet principal (Â → @, 2e adresse, LinkedIn, commentaire) avant tout import.
  onglets = [corrigerOngletPrincipal(onglets[0]), ...onglets.slice(1)];
  // Le 1er onglet alimente les fiches consultants ; tous les onglets sont recopiés à l'identique dans le tableau de suivi.
  const { entetes, lignes } = onglets[0];
  const resumeOnglets = onglets.map((o) => ({ nom: o.nom, lignes: o.lignes.length, colonnes: o.entetes.length }));
  const { fiches, rapport } = preparerImport(entetes, lignes);
  const { correspondance } = detecterColonnes(entetes);
  const colonnes = Object.entries(correspondance).map(([champ, i]) => ({ champ, colonne: entetes[i as number] }));

  if (!confirmer) return { etape: "apercu", nomFichier: fichier.name, colonnes, rapport, onglets: resumeOnglets };
  if (!colonnes.some((c) => c.champ === "nom" || c.champ === "nom_complet")) {
    return { etape: "erreur", message: "Aucune colonne « Nom » reconnue : import impossible." };
  }

  const { data: execution } = await supabase
    .from("executions")
    .insert({ type: "import_excel", rapport: { fichier: fichier.name, ...rapport }, elements_traites: fiches.length })
    .select("id")
    .single();
  try {
    const bilan = await ecrireFiches(supabase, fiches, utilisateur.id);
    const bilanTableau = await ecrireTableau(supabase, onglets, fichier.name);
    if (execution) {
      await supabase.from("executions").update({
        fin: new Date().toISOString(), statut: bilan.erreurs.length || bilanTableau.erreurs.length ? "termine_avec_erreurs" : "termine",
        erreurs: bilan.erreurs.length + bilanTableau.erreurs.length, rapport: { fichier: fichier.name, ...rapport, bilan, bilanTableau },
      }).eq("id", execution.id);
    }
    revalidatePath("/");
    revalidatePath("/consultants");
    revalidatePath("/tableau");
    return { etape: "termine", nomFichier: fichier.name, rapport, bilan, bilanTableau, onglets: resumeOnglets };
  } catch (e) {
    if (execution) await supabase.from("executions").update({ fin: new Date().toISOString(), statut: "echec" }).eq("id", execution.id);
    return { etape: "erreur", message: `Import interrompu : ${(e as Error).message}` };
  }
}
