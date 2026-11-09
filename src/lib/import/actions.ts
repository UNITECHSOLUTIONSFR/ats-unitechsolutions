"use server";

import { revalidatePath } from "next/cache";
import { exigerAdmin } from "@/lib/acces-admin";
import { detecterColonnes, lireClasseur, preparerImport, type RapportImport } from "./excel";
import { ecrireFiches, type BilanEcriture } from "./ecriture";

export interface EtatImport {
  etape: "depart" | "apercu" | "termine" | "erreur";
  nomFichier?: string;
  colonnes?: { champ: string; colonne: string }[];
  rapport?: RapportImport;
  bilan?: BilanEcriture;
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

  let entetes: string[], lignes;
  try {
    ({ entetes, lignes } = await lireClasseur(new Uint8Array(await fichier.arrayBuffer())));
  } catch {
    return { etape: "erreur", message: "Fichier illisible. Vérifiez qu'il s'agit bien d'une copie .xlsx du fichier de suivi." };
  }
  const { fiches, rapport } = preparerImport(entetes, lignes);
  const { correspondance } = detecterColonnes(entetes);
  const colonnes = Object.entries(correspondance).map(([champ, i]) => ({ champ, colonne: entetes[i as number] }));

  if (!confirmer) return { etape: "apercu", nomFichier: fichier.name, colonnes, rapport };
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
    if (execution) {
      await supabase.from("executions").update({
        fin: new Date().toISOString(), statut: bilan.erreurs.length ? "termine_avec_erreurs" : "termine",
        erreurs: bilan.erreurs.length, rapport: { fichier: fichier.name, ...rapport, bilan },
      }).eq("id", execution.id);
    }
    revalidatePath("/");
    revalidatePath("/consultants");
    return { etape: "termine", nomFichier: fichier.name, rapport, bilan };
  } catch (e) {
    if (execution) await supabase.from("executions").update({ fin: new Date().toISOString(), statut: "echec" }).eq("id", execution.id);
    return { etape: "erreur", message: `Import interrompu : ${(e as Error).message}` };
  }
}
