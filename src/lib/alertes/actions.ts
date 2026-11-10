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

/** Traite une alerte (bouton de la ligne) ou toutes les alertes cochées : « resolue:<id> », « ignoree:selection »… */
export async function traiterAlertes(formData: FormData) {
  const { utilisateur, supabase } = await exigerUtilisateur();
  const [statutDemande, cible] = String(formData.get("action") ?? "").split(":");
  const statut = statutDemande === "ignoree" ? "ignoree" : "resolue";
  const ids = (cible === "selection" ? formData.getAll("ids").map(String) : [cible]).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 500);
  if (!ids.length) return;
  await supabase.from("alertes").update({ statut, resolue_par: utilisateur.id, resolue_le: new Date().toISOString() }).in("id", ids);
  revalidatePath("/alertes");
  revalidatePath("/");
}
