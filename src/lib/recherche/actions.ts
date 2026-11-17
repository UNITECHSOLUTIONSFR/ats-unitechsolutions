"use server";

import { after } from "next/server";
import { exigerUtilisateur } from "@/lib/acces";
import { ErreurIA, lireRecherche } from "@/lib/ai";
import { enregistrerUsages, etatBudgetMois } from "@/lib/ai/journal";
import { rechercherProfils, type Criteres, type ResultatRecherche } from "./moteur";

export interface ReponseRecherche { criteres?: Criteres; reponse?: string; resultats?: ResultatRecherche[]; erreur?: string }

/** Message du recruteur : l'IA met à jour les critères (elle ne voit aucun candidat), puis le classement est calculé sans IA. */
export async function envoyerMessageRecherche(message: string, criteresActuels: Criteres | null): Promise<ReponseRecherche> {
  const { utilisateur, supabase } = await exigerUtilisateur();
  const texte = message.trim().slice(0, 2000);
  if (!texte) return { erreur: "Décrivez le profil recherché." };
  // Suivi de l'activité (Paramètres → Activité de l'équipe) : la recherche est notée après la réponse.
  after(async () => { await supabase.from("journal_acces").insert({ utilisateur_id: utilisateur.id, action: "recherche", details: { texte: texte.slice(0, 200) } }); });
  // Même phrase (avec les mêmes critères de départ) déjà lue par l'IA ces 30 derniers jours : réponse instantanée, sans IA.
  const { createHash } = await import("node:crypto");
  const { clientSupabaseAdmin } = await import("@/lib/supabase/admin");
  const admin = clientSupabaseAdmin();
  const cle = createHash("sha256").update(`${texte.toLowerCase().replace(/\s+/g, " ")}|${JSON.stringify(criteresActuels ?? null)}`).digest("hex");
  const { data: deja } = await admin.from("cache_recherches").select("criteres, reponse").eq("cle", cle)
    .gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString()).maybeSingle();
  if (deja) {
    const criteres = deja.criteres as Criteres;
    return { criteres, reponse: (deja.reponse as string | null) ?? undefined, resultats: await rechercherProfils(supabase, criteres) };
  }
  const budget = await etatBudgetMois();
  if (budget.depasse) return { erreur: `Plafond IA du mois atteint (${budget.depense.toFixed(2)} $ / ${budget.plafond} $) : modifiez les critères à la main.` };
  try {
    const r = await lireRecherche(texte, criteresActuels);
    const { reponse, ...criteres } = r.donnees;
    // Journal des coûts et mémorisation de la lecture : après la réponse.
    after(async () => {
      await enregistrerUsages(r.usages, "recherche");
      await admin.from("cache_recherches").upsert({ cle, criteres, reponse: reponse ?? null, created_at: new Date().toISOString() });
    });
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
