"use server";

import { revalidatePath } from "next/cache";
import { exigerUtilisateur } from "@/lib/acces";

/** Marque une alerte comme résolue ou ignorée (trace de qui et quand). */
export async function traiterAlerte(formData: FormData) {
  const { utilisateur, supabase } = await exigerUtilisateur();
  const statut = formData.get("statut") === "ignoree" ? "ignoree" : "resolue";
  await supabase.from("alertes").update({ statut, resolue_par: utilisateur.id, resolue_le: new Date().toISOString() }).eq("id", String(formData.get("id")));
  revalidatePath("/alertes");
  revalidatePath("/");
}
