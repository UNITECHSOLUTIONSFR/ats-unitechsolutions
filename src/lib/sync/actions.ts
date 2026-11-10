"use server";

import { revalidatePath } from "next/cache";
import { exigerAdmin } from "@/lib/acces-admin";
import { clientSupabaseAdmin } from "@/lib/supabase/admin";
import { executerTache, TACHES, type NomTache } from "./taches";

export interface EtatTache { message?: string; erreur?: string }

/** Lance une tâche planifiée tout de suite (sans attendre la nuit). */
export async function lancerTache(_e: EtatTache, formData: FormData): Promise<EtatTache> {
  await exigerAdmin();
  const nom = String(formData.get("tache")) as NomTache;
  if (!(nom in TACHES)) return { erreur: "Tâche inconnue." };
  const r = await executerTache(nom, clientSupabaseAdmin());
  revalidatePath("/parametres/synchronisations");
  revalidatePath("/");
  return r.ok ? { message: `${TACHES[nom].libelle} : terminé.` } : { erreur: `${TACHES[nom].libelle} : ${String(r.rapport.erreur)}` };
}
