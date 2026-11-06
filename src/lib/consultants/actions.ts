"use server";

import { revalidatePath } from "next/cache";
import { exigerUtilisateur } from "@/lib/acces";
import { normaliserTelephone } from "@/lib/metier/telephone";
import { normaliserEmail } from "@/lib/metier/dedoublonnage";

const STATUTS = ["candidat", "consultant", "en_mission", "inactif"];

/** Modifie une fiche depuis l'interface, en gardant l'historique et la trace dans le journal d'accès. */
export async function modifierConsultant(formData: FormData) {
  const { utilisateur, supabase } = await exigerUtilisateur();
  const id = String(formData.get("id"));
  const { data: avant } = await supabase
    .from("consultants")
    .select("intitule_poste, disponibilite, disponible_le, telephone_e164, email, localisation, statut, notes")
    .eq("id", id)
    .maybeSingle();
  if (!avant) return;

  const texte = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v === "" ? null : v;
  };
  const tel = normaliserTelephone(texte("telephone"));
  const statut = String(formData.get("statut"));
  const apres: Record<string, unknown> = {
    intitule_poste: texte("intitule_poste"),
    disponibilite: texte("disponibilite"),
    disponible_le: texte("disponible_le"),
    telephone_e164: tel.e164 ?? (tel.statut === "vide" ? null : avant.telephone_e164),
    email: normaliserEmail(texte("email")) ?? (texte("email") ? avant.email : null),
    localisation: texte("localisation"),
    statut: STATUTS.includes(statut) ? statut : avant.statut,
    notes: texte("notes"),
  };

  const modifications: Record<string, { avant: unknown; apres: unknown }> = {};
  for (const [k, v] of Object.entries(apres)) {
    const a = (avant as Record<string, unknown>)[k] ?? null;
    if (String(a ?? "") !== String(v ?? "")) modifications[k] = { avant: a, apres: v };
  }
  if (!Object.keys(modifications).length) return;
  if (modifications.disponibilite || modifications.disponible_le) apres.disponibilite_maj_le = new Date().toISOString();

  const { error } = await supabase.from("consultants").update(apres).eq("id", id);
  if (error) throw new Error(error.message.includes("consultants_email_unique") ? "Cet email est déjà utilisé par une autre fiche." : error.message);
  await supabase.from("consultants_historique").insert({ consultant_id: id, source: "interface", modifications, par: utilisateur.id });
  await supabase.from("journal_acces").insert({
    utilisateur_id: utilisateur.id, action: "modification", consultant_id: id, details: { champs: Object.keys(modifications) },
  });
  revalidatePath(`/consultants/${id}`);
}
