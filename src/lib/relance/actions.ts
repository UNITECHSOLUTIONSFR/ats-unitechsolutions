"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { exigerAdmin } from "@/lib/acces-admin";
import { poursuivreEnvoi } from "./declenchement";
import { destinatairesCampagne, preparerCampagne, type FiltreCampagne } from "./envoi";
import { envoiActif } from "./modele";

export interface EtatRelance { erreur?: string; message?: string }
export interface ApercuDestinataires { total: number; exemples: { id: string; nom: string; poste: string | null; disponibilite: string | null }[] }

function lireFiltre(formData: FormData): FiltreCampagne {
  const jours = Number(formData.get("dispo_jours") ?? 0);
  return {
    statuts: formData.getAll("statuts").map(String).filter(Boolean),
    fonction: String(formData.get("fonction") ?? "").trim() || undefined,
    dispoPlusVieilleQueJours: jours > 0 ? jours : undefined,
    disponibleAvant: String(formData.get("disponible_avant") ?? "") || undefined,
    exclus: JSON.parse(String(formData.get("exclus") ?? "[]")) as string[],
  };
}

/** Nombre de destinataires et premiers noms, pour vérifier la sélection avant de préparer l'envoi. */
export async function apercuDestinataires(filtre: FiltreCampagne): Promise<ApercuDestinataires> {
  const { supabase } = await exigerAdmin();
  const d = await destinatairesCampagne(supabase, filtre);
  return {
    total: d.length,
    exemples: d.slice(0, 50).map((c) => ({ id: c.id, nom: `${c.prenom === "—" ? "" : c.prenom} ${c.nom}`.trim(), poste: c.intitule_poste, disponibilite: c.disponibilite })),
  };
}

/** Prépare l'envoi (aucun email ne part à ce stade). */
export async function creerCampagne(_e: EtatRelance, formData: FormData): Promise<EtatRelance> {
  const { utilisateur, supabase } = await exigerAdmin();
  const objet = String(formData.get("objet") ?? "").trim(), corps = String(formData.get("corps") ?? "").trim();
  if (!objet || corps.length < 20) return { erreur: "Objet et message obligatoires." };
  const type = formData.get("type") === "libre" ? "libre" : "disponibilite";
  const r = await preparerCampagne(supabase, { objet, corps, type, filtre: lireFiltre(formData), par: utilisateur.id });
  if (!r.destinataires) return { erreur: "Aucun consultant ne correspond à ces critères." };
  revalidatePath("/emails");
  return { message: `Envoi préparé pour ${r.destinataires} consultant(s). Vérifiez-le dans « Envois » puis cliquez « Lancer l'envoi ».` };
}

/** Enregistre le message courant comme modèle réutilisable. */
export async function enregistrerModele(formData: FormData) {
  const { utilisateur, supabase } = await exigerAdmin();
  const nom = String(formData.get("nom_modele") ?? "").trim(), objet = String(formData.get("objet") ?? "").trim(), corps = String(formData.get("corps") ?? "").trim();
  if (!nom || !objet || !corps) return;
  await supabase.from("modeles_email").insert({ nom, objet, corps, type: formData.get("type") === "libre" ? "libre" : "disponibilite", cree_par: utilisateur.id });
  revalidatePath("/emails");
}

export async function supprimerModele(formData: FormData) {
  const { supabase } = await exigerAdmin();
  await supabase.from("modeles_email").delete().eq("id", String(formData.get("id")));
  revalidatePath("/emails");
}

/** Lance l'envoi d'une campagne préparée (l'administrateur seulement), ou l'annule. */
export async function changerCampagne(formData: FormData) {
  const { utilisateur, supabase } = await exigerAdmin();
  const id = String(formData.get("id")), action = String(formData.get("action"));
  if (action === "lancer") {
    if (!envoiActif()) return; // Exchange pas encore branché : rien ne peut partir
    await supabase.from("campagnes_relance").update({ statut: "en_cours", lancee_le: new Date().toISOString() }).eq("id", id).eq("statut", "preparee");
    await supabase.from("journal_acces").insert({ utilisateur_id: utilisateur.id, action: "modification", consultant_id: null, details: { envoi_emails_lance: id } });
    after(poursuivreEnvoi); // l'envoi démarre tout de suite, depuis l'application
  }
  if (action === "annuler") await supabase.from("campagnes_relance").update({ statut: "annulee" }).eq("id", id).in("statut", ["preparee", "en_cours"]);
  revalidatePath("/emails");
}
