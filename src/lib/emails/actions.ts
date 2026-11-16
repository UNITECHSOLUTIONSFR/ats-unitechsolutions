"use server";

import { revalidatePath } from "next/cache";
import { exigerAdmin } from "@/lib/acces-admin";
import { clientSupabaseAdmin } from "@/lib/supabase/admin";
import { traiterEmails } from "./traitement";

export interface EtatEmails {
  message?: string;
  erreur?: string;
}

/** Traite les nouveaux emails de la boîte ATS Candidatures (25 par clic ; relancer s'il en reste). */
export async function lancerTraitementEmails(): Promise<EtatEmails> {
  await exigerAdmin();
  try {
    const b = await traiterEmails(clientSupabaseAdmin());
    revalidatePath("/parametres/emails");
    return {
      message: `${b.lus} email(s) lus : ${b.candidatures} candidature(s) enregistrée(s) (dont ${b.dejaConnues} CV déjà connus), ${b.ignores} ignoré(s) (internes ou sans CV), ${b.erreurs.length} erreur(s). Coût : ${b.coutUSD.toFixed(3)} $.${b.restants ? " Il reste des emails : relancez." : ""}`,
      erreur: b.erreurs.length ? b.erreurs.slice(0, 3).join(" ; ") : undefined,
    };
  } catch (e) {
    return { erreur: `Traitement impossible : ${(e as Error).message}` };
  }
}

export interface EtatReprise { message?: string; erreur?: string; restants?: number; total?: number; candidatures?: number; cout?: number }

/** Reprise d'un dossier d'une boîte personnelle (accès Exchange temporaire) : 12 emails par appel, relancé par l'écran tant qu'il en reste. */
export async function lancerRepriseDossier(_e: EtatReprise, formData: FormData): Promise<EtatReprise> {
  await exigerAdmin();
  const boite = String(formData.get("boite") ?? "").trim().toLowerCase();
  const dossier = String(formData.get("dossier") ?? "").trim();
  if (!/^[^@\s]+@unitechsolutions\.fr$/.test(boite) || !dossier) return { erreur: "Indiquez une adresse @unitechsolutions.fr et le nom du dossier." };
  try {
    const { repriseDossierBoite } = await import("./reprise");
    const b = await repriseDossierBoite(clientSupabaseAdmin(), boite, dossier, 60); // jusqu'à 60 emails par passage, 6 en parallèle, arrêt à 4 minutes
    revalidatePath("/parametres/emails");
    return {
      message: `${b.lus} email(s) lus : ${b.candidatures} candidature(s) enregistrée(s) (dont ${b.dejaConnues} CV déjà connus), ${b.ignores} ignoré(s). Coût : ${b.coutUSD.toFixed(3)} $.`,
      erreur: b.erreurs.length ? b.erreurs.slice(0, 3).join(" ; ") : undefined, restants: b.aFaire, total: b.total, candidatures: b.candidatures, cout: b.coutUSD,
    };
  } catch (e) {
    return { erreur: `Reprise impossible : ${(e as Error).message}` };
  }
}

export interface EtatFichiers { message?: string; erreur?: string; ranges?: number; restants?: number; aSuivre?: boolean; lecture?: string }

/**
 * Récupère les FICHIERS des CV déjà analysés (historique du groupe recrutement@ ou dossier « Consultant » de la boîte de
 * l'administratrice connectée) et les range dans SharePoint « Candidatures reçues ». Administrateurs, par passages.
 */
export async function recupererFichiersCV(_e: EtatFichiers, formData: FormData): Promise<EtatFichiers> {
  const { utilisateur } = await exigerAdmin();
  const source = String(formData.get("source")) === "groupe" ? "groupe" : "perso";
  try {
    const { recupererFichiersHistorique } = await import("./fichiers-historique");
    const b = await recupererFichiersHistorique(clientSupabaseAdmin(), source, { boite: utilisateur.email });
    const reste = Math.max(0, b.aTraiter - b.ranges);
    revalidatePath("/parametres/emails");
    return {
      message: `${b.ranges} fichier(s) rangé(s) dans SharePoint.`, ranges: b.ranges, restants: reste, aSuivre: b.aSuivre, lecture: b.lecture,
      erreur: b.erreurs.length ? `${b.erreurs.length} fichier(s) non récupéré(s) : ${b.erreurs.slice(0, 2).join(" ; ")}` : undefined,
    };
  } catch (e) {
    return { erreur: `Récupération impossible : ${(e as Error).message}` };
  }
}
