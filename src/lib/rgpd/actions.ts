"use server";

import { revalidatePath } from "next/cache";
import { invaliderTableau } from "@/lib/tableau/cache";
import { exigerAdmin } from "@/lib/acces-admin";
import { effacerPersonne, type FichierAEffacer } from "./effacement";

export interface EtatEffacement { fichiers?: FichierAEffacer[]; supprimes?: number; erreur?: string }

/** Purge à 24 mois : efface les fiches sélectionnées (confirmation « SUPPRIMER »). */
export async function purgerSelection(_e: EtatEffacement, formData: FormData): Promise<EtatEffacement> {
  const { supabase } = await exigerAdmin();
  if (String(formData.get("confirmation") ?? "").trim() !== "SUPPRIMER") return { erreur: "Saisissez SUPPRIMER pour confirmer." };
  const ids = formData.getAll("ids").map(String);
  if (!ids.length) return { erreur: "Aucune fiche sélectionnée." };
  const fichiers: FichierAEffacer[] = [];
  for (const id of ids) fichiers.push(...(await effacerPersonne(supabase, id)));
  invaliderTableau();
  revalidatePath("/parametres/rgpd");
  return { fichiers, supprimes: ids.length };
}
