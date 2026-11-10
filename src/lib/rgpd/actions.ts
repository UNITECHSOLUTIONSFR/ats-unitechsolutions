"use server";

import { revalidatePath } from "next/cache";
import { exigerAdmin } from "@/lib/acces-admin";
import { effacerPersonne, type FichierAEffacer } from "./effacement";

export interface EtatEffacement { fichiers?: FichierAEffacer[]; supprimes?: number; erreur?: string }

/** Effacement d'une personne (administrateur, confirmation par le trigramme). */
export async function effacerConsultant(_e: EtatEffacement, formData: FormData): Promise<EtatEffacement> {
  const { supabase } = await exigerAdmin();
  const id = String(formData.get("id"));
  const { data: c } = await supabase.from("consultants").select("trigramme").eq("id", id).maybeSingle();
  if (!c) return { erreur: "Fiche introuvable." };
  if (String(formData.get("confirmation") ?? "").trim().toUpperCase() !== c.trigramme.toUpperCase()) {
    return { erreur: `Pour confirmer, saisissez le trigramme ${c.trigramme}.` };
  }
  try {
    const fichiers = await effacerPersonne(supabase, id);
    revalidatePath("/consultants");
    return { fichiers, supprimes: 1 };
  } catch (e) {
    return { erreur: (e as Error).message };
  }
}

/** Purge à 24 mois : efface les fiches sélectionnées (confirmation « SUPPRIMER »). */
export async function purgerSelection(_e: EtatEffacement, formData: FormData): Promise<EtatEffacement> {
  const { supabase } = await exigerAdmin();
  if (String(formData.get("confirmation") ?? "").trim() !== "SUPPRIMER") return { erreur: "Saisissez SUPPRIMER pour confirmer." };
  const ids = formData.getAll("ids").map(String);
  if (!ids.length) return { erreur: "Aucune fiche sélectionnée." };
  const fichiers: FichierAEffacer[] = [];
  for (const id of ids) fichiers.push(...(await effacerPersonne(supabase, id)));
  revalidatePath("/parametres/rgpd");
  return { fichiers, supprimes: ids.length };
}
