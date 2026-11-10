"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { poursuivreEnvoi } from "./declenchement";
import { exigerAdmin } from "@/lib/acces-admin";
import { destinatairesCampagne, preparerCampagne, type FiltreCampagne } from "./envoi";
import { relanceActive } from "./modele";

export interface EtatRelance { erreur?: string; message?: string }

function lireFiltre(formData: FormData): FiltreCampagne {
  const statuts = formData.getAll("statuts").map(String).filter(Boolean);
  const jours = Number(formData.get("dispo_jours") ?? 0);
  return { statuts, dispoPlusVieilleQueJours: jours > 0 ? jours : undefined };
}

/** Compte les destinataires d'un filtre (aperçu avant de préparer). */
export async function compterDestinataires(filtre: FiltreCampagne): Promise<number> {
  const { supabase } = await exigerAdmin();
  if (!relanceActive()) return 0;
  return (await destinatairesCampagne(supabase, filtre)).length;
}

/** Prépare une campagne (aucun email n'est envoyé à ce stade). */
export async function creerCampagne(_e: EtatRelance, formData: FormData): Promise<EtatRelance> {
  const { utilisateur, supabase } = await exigerAdmin();
  if (!relanceActive()) return { erreur: "La relance des disponibilités n'est pas activée." };
  const objet = String(formData.get("objet") ?? "").trim(), corps = String(formData.get("corps") ?? "").trim();
  if (!objet || corps.length < 20) return { erreur: "Objet et message obligatoires." };
  const r = await preparerCampagne(supabase, { objet, corps, filtre: lireFiltre(formData), par: utilisateur.id });
  revalidatePath("/parametres/relance");
  return { message: `Campagne préparée pour ${r.destinataires} consultant(s). Vérifiez puis cliquez « Lancer l'envoi ».` };
}

/** Lance l'envoi d'une campagne préparée (l'envoi se fait ensuite par lots, à chaque minute) ou l'annule. */
export async function changerCampagne(formData: FormData) {
  const { utilisateur, supabase } = await exigerAdmin();
  if (!relanceActive()) return;
  const id = String(formData.get("id")), action = String(formData.get("action"));
  if (action === "lancer") {
    await supabase.from("campagnes_relance").update({ statut: "en_cours", lancee_le: new Date().toISOString() }).eq("id", id).eq("statut", "preparee");
    await supabase.from("journal_acces").insert({ utilisateur_id: utilisateur.id, action: "modification", consultant_id: null, details: { relance_lancee: id } });
    after(poursuivreEnvoi); // l'envoi démarre tout de suite, depuis l'application
  }
  if (action === "annuler") await supabase.from("campagnes_relance").update({ statut: "annulee" }).eq("id", id).in("statut", ["preparee", "en_cours"]);
  revalidatePath("/parametres/relance");
}
