"use server";

import { exigerUtilisateur } from "@/lib/acces";
import { ErreurIA, lireRecherche } from "@/lib/ai";
import { enregistrerUsages, etatBudgetMois } from "@/lib/ai/journal";
import { rechercherProfils, type Criteres, type ResultatRecherche } from "./moteur";

export interface ReponseRecherche { criteres?: Criteres; reponse?: string; resultats?: ResultatRecherche[]; erreur?: string }

/** Message du recruteur : l'IA met à jour les critères (elle ne voit aucun candidat), puis le classement est calculé sans IA. */
export async function envoyerMessageRecherche(message: string, criteresActuels: Criteres | null): Promise<ReponseRecherche> {
  const { supabase } = await exigerUtilisateur();
  const texte = message.trim().slice(0, 2000);
  if (!texte) return { erreur: "Décrivez le profil recherché." };
  const budget = await etatBudgetMois();
  if (budget.depasse) return { erreur: `Plafond IA du mois atteint (${budget.depense.toFixed(2)} $ / ${budget.plafond} $) : modifiez les critères à la main.` };
  try {
    const r = await lireRecherche(texte, criteresActuels);
    await enregistrerUsages(r.usages, "recherche");
    const { reponse, ...criteres } = r.donnees;
    return { criteres, reponse, resultats: await rechercherProfils(supabase, criteres) };
  } catch (e) {
    const usages = (e as { usages?: Parameters<typeof enregistrerUsages>[0] }).usages;
    if (usages) await enregistrerUsages(usages, "recherche");
    return { erreur: e instanceof ErreurIA ? e.message : "La recherche n'a pas abouti. Réessayez dans un instant." };
  }
}

/** Critères modifiés à la main (compétence retirée, rendue obligatoire…) : nouveau classement, sans IA. */
export async function relancerRecherche(criteres: Criteres): Promise<ReponseRecherche> {
  const { supabase } = await exigerUtilisateur();
  try {
    return { criteres, resultats: await rechercherProfils(supabase, criteres) };
  } catch {
    return { erreur: "La recherche n'a pas abouti. Réessayez dans un instant." };
  }
}
