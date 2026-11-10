"use server";

import { revalidatePath } from "next/cache";
import { exigerAdmin } from "@/lib/acces-admin";
import { clientSupabaseAdmin } from "@/lib/supabase/admin";
import { normaliserEmail } from "@/lib/metier/dedoublonnage";

export interface EtatUtilisateur {
  message?: string;
  erreur?: string;
}

/** Invite une personne : son compte est créé, elle se connecte ensuite avec le lien magique. */
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

  let id: string | undefined;
  const cree = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (cree.data.user) id = cree.data.user.id;
  else {
    // Compte d'authentification déjà existant (ancien accès retiré) : on le retrouve.
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    id = data.users.find((u) => u.email?.toLowerCase() === email)?.id;
  }
  if (!id) return { erreur: `Création du compte impossible : ${cree.error?.message ?? "erreur inconnue"}` };

  const { error } = await supabase.from("utilisateurs").insert({ id, email, nom_affiche: nom, role, actif: true });
  if (error) return { erreur: `Enregistrement impossible : ${error.message}` };
  revalidatePath("/parametres/utilisateurs");
  return { message: `${email} peut maintenant se connecter (lien envoyé à chaque connexion).` };
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
