"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { calculerTrigramme } from "@/lib/metier/trigramme";
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
  revalidatePath("/consultants"); // le tableau gardé en mémoire dans le navigateur est rafraîchi
}

export interface EtatCreation { erreur?: string }

/** Crée une fiche à la main. Elle apparaît dans l'écran Consultants et sera ajoutée au fichier Excel la nuit suivante. */
export async function creerConsultant(_e: EtatCreation, formData: FormData): Promise<EtatCreation> {
  const { utilisateur, supabase } = await exigerUtilisateur();
  const texte = (k: string) => String(formData.get(k) ?? "").trim() || null;
  const prenom = texte("prenom"), nom = texte("nom");
  if (!nom) return { erreur: "Le nom est obligatoire." };
  const email = normaliserEmail(texte("email"));
  if (texte("email") && !email) return { erreur: "Email invalide." };
  const tel = normaliserTelephone(texte("telephone"));
  // Dédoublonnage : jamais de seconde fiche pour la même personne.
  if (email) {
    const { data } = await supabase.from("consultants").select("id").eq("email", email).maybeSingle();
    if (data) return { erreur: "Une fiche existe déjà avec cet email." };
  }
  if (tel.e164) {
    const { data } = await supabase.from("consultants").select("id").eq("telephone_e164", tel.e164).limit(1).maybeSingle();
    if (data) return { erreur: "Une fiche existe déjà avec ce téléphone." };
  }
  const { data: cree, error } = await supabase.from("consultants").insert({
    prenom: prenom ?? "—", nom, trigramme: calculerTrigramme(prenom ?? "", nom), email, telephone_e164: tel.e164,
    telephone_brut: tel.statut === "invalide" ? tel.brut : null, intitule_poste: texte("intitule_poste"),
    disponibilite: texte("disponibilite"), disponibilite_maj_le: texte("disponibilite") ? new Date().toISOString() : null,
    localisation: texte("localisation"), notes: texte("notes"), source: "manuel", statut: "candidat",
  }).select("id").single();
  if (error || !cree) return { erreur: error?.message ?? "Fiche non créée." };
  await supabase.from("journal_acces").insert({ utilisateur_id: utilisateur.id, action: "creation", consultant_id: cree.id, details: {} });
  revalidatePath("/consultants");
  redirect(`/consultants/${cree.id}`);
}

/** Fusionne deux fiches d'une même personne (administrateurs). La fiche « gardée » reçoit les valeurs choisies et tout le reste. */
export async function fusionnerFiches(formData: FormData) {
  const { utilisateur, supabase } = await exigerUtilisateur();
  if (utilisateur.role !== "admin") throw new Error("Fusion réservée aux administrateurs.");
  const garde = String(formData.get("garde")), supprime = String(formData.get("supprime"));
  const valeurs: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith("champ:")) continue;
    const [source, champ] = [String(v), k.slice(6)];
    if (source !== "autre") continue; // par défaut, la valeur de la fiche gardée reste
    valeurs[champ] = formData.get(`valeur:${champ}`) === "" ? null : formData.get(`valeur:${champ}`);
  }
  const { error } = await supabase.rpc("fusionner_consultants", { p_garde: garde, p_supprime: supprime, p_valeurs: valeurs });
  if (error) throw new Error(error.message);
  revalidatePath("/alertes");
  revalidatePath("/consultants");
  redirect(`/consultants/${garde}`);
}

/** Ajoute une note datée sur une fiche (visible par toute l'équipe). */
export async function ajouterNote(formData: FormData): Promise<{ ok: boolean }> {
  const { utilisateur, supabase } = await exigerUtilisateur();
  const consultantId = String(formData.get("consultant_id")), texte = String(formData.get("texte") ?? "").trim();
  if (!texte) return { ok: false };
  const { error } = await supabase.from("notes_consultant").insert({ consultant_id: consultantId, texte: texte.slice(0, 2000), auteur: utilisateur.id });
  await supabase.from("consultants").update({ dernier_contact_le: new Date().toISOString() }).eq("id", consultantId);
  revalidatePath(`/consultants/${consultantId}`);
  return { ok: !error };
}

export async function retirerNote(formData: FormData) {
  const { supabase } = await exigerUtilisateur();
  await supabase.from("notes_consultant").delete().eq("id", String(formData.get("id")));
  revalidatePath(`/consultants/${String(formData.get("consultant_id"))}`);
}
