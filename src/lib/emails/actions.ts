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
