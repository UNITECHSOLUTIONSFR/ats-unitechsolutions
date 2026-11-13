"use server";

import { revalidatePath } from "next/cache";
import { invaliderTableau } from "@/lib/tableau/cache";
import { redirect } from "next/navigation";
import { calculerTrigramme } from "@/lib/metier/trigramme";
import { exigerUtilisateur } from "@/lib/acces";
import { normaliserTelephone } from "@/lib/metier/telephone";
import { normaliserEmail } from "@/lib/metier/dedoublonnage";
import { enregistrerCVJoint, lireCVJoint } from "./cv-joint";

const STATUTS = ["candidat", "consultant", "en_mission", "inactif"];

/** Modifie une fiche depuis l'interface, en gardant l'historique et la trace dans le journal d'accès. */
export async function modifierConsultant(formData: FormData) {
  const { utilisateur, supabase } = await exigerUtilisateur();
  const id = String(formData.get("id"));
  const { data: avant } = await supabase
    .from("consultants")
    .select("intitule_poste, disponibilite, disponible_le, telephone_e164, email, localisation, mobilite, statut, notes")
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
    mobilite: texte("mobilite"),
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
  invaliderTableau();
  revalidatePath("/consultants"); // le tableau gardé en mémoire dans le navigateur est rafraîchi
}

export interface EtatCreation { erreur?: string }

/** Crée une fiche à la main. Elle apparaît dans l'écran Consultants et sera ajoutée au fichier Excel la nuit suivante. */
export async function creerConsultant(_e: EtatCreation, formData: FormData): Promise<EtatCreation> {
  const { utilisateur, supabase } = await exigerUtilisateur();
  const saisi = (k: string) => String(formData.get(k) ?? "").trim() || null;
  // CV joint : lu d'abord ; les champs laissés vides sont remplis à partir du CV (ce que l'équipe a saisi est prioritaire).
  const fichier = formData.get("cv");
  const lecture = fichier instanceof File && fichier.size > 0 ? await lireCVJoint(fichier) : null;
  if (lecture && "erreur" in lecture) return { erreur: lecture.erreur };
  const p = lecture?.profil;
  const duCV: Record<string, string | null> = {
    prenom: p?.prenom ?? null, nom: p?.nom ?? null, email: p?.email ?? null, telephone: p?.telephone ?? null,
    intitule_poste: p?.intitule_poste ?? null, localisation: p?.localisation ?? null,
    experience: p?.annees_experience ? `${p.annees_experience} ans` : null, linkedin: lecture?.linkedin ?? null,
  };
  const texte = (k: string) => saisi(k) ?? duCV[k] ?? null;
  const prenom = texte("prenom"), nom = texte("nom");
  if (!nom) return { erreur: lecture ? "Le nom n'a pas été trouvé dans le CV : saisissez-le." : "Le nom est obligatoire (ou joignez le CV)." };
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
  // Trigramme : celui saisi (lettres, 4 au plus), sinon calculé ; date de mise à jour : celle saisie, sinon aujourd'hui si une disponibilité est donnée.
  const trigrammeSaisi = (texte("trigramme") ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
  const dateMaj = /^\d{4}-\d{2}-\d{2}$/.test(texte("date_maj") ?? "") ? new Date(`${texte("date_maj")}T12:00:00Z`).toISOString() : null;
  const statut = ["candidat", "consultant", "inactif"].includes(texte("statut") ?? "") ? texte("statut") : "candidat";
  const linkedin = texte("linkedin");
  const { data: cree, error } = await supabase.from("consultants").insert({
    prenom: prenom ?? "—", nom, trigramme: trigrammeSaisi || calculerTrigramme(prenom ?? "", nom), email, telephone_e164: tel.e164,
    telephone_brut: tel.statut === "invalide" ? tel.brut : null, intitule_poste: texte("intitule_poste"),
    experience: texte("experience"), tjm_salaire: texte("tjm_salaire"),
    disponibilite: texte("disponibilite"), disponibilite_maj_le: dateMaj ?? (texte("disponibilite") ? new Date().toISOString() : null),
    localisation: texte("localisation"), linkedin: linkedin && /^https?:\/\//i.test(linkedin) ? linkedin : linkedin ? `https://${linkedin}` : null,
    notes: texte("notes"), source: "manuel", statut,
  }).select("id").single();
  if (error || !cree) return { erreur: error?.message ?? "Fiche non créée." };
  await supabase.from("journal_acces").insert({ utilisateur_id: utilisateur.id, action: "creation", consultant_id: cree.id, details: {} });
  // CV joint : rangé dans SharePoint, compétences enregistrées (lecture déjà faite) ; la fiche sort dans la recherche et le matching.
  const avertissement = lecture ? await enregistrerCVJoint(cree.id, lecture, { prenom: prenom ?? "—", nom }) : null;
  invaliderTableau();
  revalidatePath("/consultants");
  redirect(`/consultants/${cree.id}${avertissement ? `?cv=${encodeURIComponent(avertissement)}` : ""}`);
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
  invaliderTableau();
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
