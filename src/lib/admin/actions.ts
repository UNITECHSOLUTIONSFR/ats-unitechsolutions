"use server";

import { revalidatePath } from "next/cache";
import { exigerAdmin } from "@/lib/acces-admin";

/** Enregistre la date d'expiration (ou de renouvellement) d'un secret. Jamais sa valeur. */
export async function enregistrerEcheance(formData: FormData) {
  const { utilisateur, supabase } = await exigerAdmin();
  const id = String(formData.get("id") ?? "");
  const date = String(formData.get("expire_le") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);
  const valeurs = { expire_le: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null, note: note || null, par: utilisateur.id };
  if (id) await supabase.from("echeances_secrets").update(valeurs).eq("id", id);
  else {
    const nom = String(formData.get("nom") ?? "").trim().slice(0, 200);
    if (!nom) return;
    await supabase.from("echeances_secrets").insert({ ...valeurs, nom, ou_renouveler: String(formData.get("ou_renouveler") ?? "").trim().slice(0, 300) || null });
  }
  revalidatePath("/parametres/echeances");
  revalidatePath("/");
}

/** Retire une ligne d'échéance (ajoutée par erreur). */
export async function retirerEcheance(formData: FormData) {
  const { supabase } = await exigerAdmin();
  await supabase.from("echeances_secrets").delete().eq("id", String(formData.get("id")));
  revalidatePath("/parametres/echeances");
  revalidatePath("/");
}
