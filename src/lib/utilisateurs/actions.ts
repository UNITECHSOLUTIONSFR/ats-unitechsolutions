"use server";

import { revalidatePath } from "next/cache";
import { exigerAdmin } from "@/lib/acces-admin";
import { clientSupabaseAdmin } from "@/lib/supabase/admin";
import { clientSupabaseServeur } from "@/lib/supabase/serveur";
import { normaliserEmail } from "@/lib/metier/dedoublonnage";
import { randomBytes } from "node:crypto";

export interface EtatUtilisateur {
  message?: string;
  erreur?: string;
  /** Mot de passe provisoire, affiché une seule fois à l'administrateur. */
  motDePasse?: string;
}

/** Mot de passe provisoire lisible (sans caractères ambigus), 14 caractères, à changer à la première connexion. */
function motDePasseProvisoire(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const octets = randomBytes(12);
  const corps = Array.from(octets, (o) => alphabet[o % alphabet.length]).join("");
  return `${corps.slice(0, 4)}-${corps.slice(4, 8)}-${corps.slice(8, 12)}`;
}

/** Ajoute une personne : son compte est créé avec un mot de passe provisoire (à lui transmettre), qu'elle change à la première connexion. */
export async function ajouterUtilisateur(_e: EtatUtilisateur, formData: FormData): Promise<EtatUtilisateur> {
  const { supabase } = await exigerAdmin();
  const email = normaliserEmail(formData.get("email"));
  const nom = String(formData.get("nom_affiche") ?? "").trim() || null;
  const role = formData.get("role") === "admin" ? "admin" : "recruteur";
  if (!email) return { erreur: "Adresse email invalide." };

  let admin;
  try {
    admin = clientSupabaseAdmin();
  } catch {
    return { erreur: "La clé serveur Supabase n'est pas configurée dans Vercel : impossible de créer le compte." };
  }

  const { data: existant } = await supabase.from("utilisateurs").select("id").eq("email", email).maybeSingle();
  if (existant) return { erreur: "Cette personne a déjà un accès (voir la liste)." };

  const motDePasse = motDePasseProvisoire();
  let id: string | undefined;
  const cree = await admin.auth.admin.createUser({ email, password: motDePasse, email_confirm: true, app_metadata: { mdp_provisoire: true } });
  if (cree.data.user) id = cree.data.user.id;
  else {
    // Compte d'authentification déjà existant (ancien accès retiré) : on le retrouve et on lui donne un mot de passe provisoire.
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    id = data.users.find((u) => u.email?.toLowerCase() === email)?.id;
    if (id) await admin.auth.admin.updateUserById(id, { password: motDePasse, app_metadata: { mdp_provisoire: true } });
  }
  if (!id) return { erreur: `Création du compte impossible : ${cree.error?.message ?? "erreur inconnue"}` };

  const { error } = await supabase.from("utilisateurs").insert({ id, email, nom_affiche: nom, role, actif: true });
  if (error) return { erreur: `Enregistrement impossible : ${error.message}` };
  revalidatePath("/parametres/utilisateurs");
  return { message: `${email} peut se connecter avec ce mot de passe provisoire (affiché une seule fois) : il en choisira un nouveau à sa première connexion.`, motDePasse };
}

/** Change le rôle, ou active / désactive l'accès (retrait d'accès en un clic). */
export async function modifierUtilisateur(formData: FormData) {
  const { utilisateur, supabase } = await exigerAdmin();
  const id = String(formData.get("id"));
  if (id === utilisateur.id) return; // on ne peut pas se retirer ses propres droits (évite de se bloquer)
  const action = String(formData.get("action"));
  if (action === "role") {
    await supabase.from("utilisateurs").update({ role: formData.get("valeur") === "admin" ? "admin" : "recruteur" }).eq("id", id);
  } else if (action === "actif") {
    await supabase.from("utilisateurs").update({ actif: formData.get("valeur") === "true" }).eq("id", id);
  }
  revalidatePath("/parametres/utilisateurs");
}

/** Mot de passe oublié : un administrateur en génère un nouveau, provisoire, affiché une seule fois. Aucun email. */
export async function nouveauMotDePasse(_e: EtatUtilisateur, formData: FormData): Promise<EtatUtilisateur> {
  const { utilisateur, supabase } = await exigerAdmin();
  const id = String(formData.get("id"));
  const { data: cible } = await supabase.from("utilisateurs").select("email").eq("id", id).maybeSingle();
  if (!cible) return { erreur: "Utilisateur introuvable." };
  const motDePasse = motDePasseProvisoire();
  const { error } = await clientSupabaseAdmin().auth.admin.updateUserById(id, { password: motDePasse, app_metadata: { mdp_provisoire: true } });
  if (error) return { erreur: error.message };
  await supabase.from("journal_acces").insert({ utilisateur_id: utilisateur.id, action: "modification", consultant_id: null, details: { mot_de_passe_reinitialise: cible.email } });
  return { message: `Nouveau mot de passe provisoire pour ${cible.email} :`, motDePasse };
}

/** Après le choix d'un mot de passe personnel : le mot de passe n'est plus « provisoire ». */
export async function motDePasseChoisi(): Promise<void> {
  const supabase = await clientSupabaseServeur();
  const { data } = (await supabase?.auth.getClaims()) ?? { data: null };
  const id = data?.claims?.sub;
  if (!id) return;
  await clientSupabaseAdmin().auth.admin.updateUserById(id, { app_metadata: { mdp_provisoire: false } });
}
