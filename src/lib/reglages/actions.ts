"use server";

import { revalidatePath } from "next/cache";
import { exigerAdmin } from "@/lib/acces-admin";

export interface EtatReglages { message?: string; erreur?: string }

const CRITERES = ["competences", "annees", "seniorite", "disponibilite", "semantique"] as const;

/** Enregistre le plafond IA mensuel et les pondérations du score (administrateurs). */
export async function enregistrerReglages(_e: EtatReglages, formData: FormData): Promise<EtatReglages> {
  const { supabase } = await exigerAdmin();
  const plafond = Number(formData.get("plafond"));
  if (!Number.isFinite(plafond) || plafond < 0 || plafond > 500) return { erreur: "Plafond invalide (entre 0 et 500 $)." };
  const ponderations = Object.fromEntries(CRITERES.map((c) => [c, Math.max(0, Math.round(Number(formData.get(c)) || 0))]));
  const total = Object.values(ponderations).reduce((a, b) => a + b, 0);
  if (total === 0) return { erreur: "Au moins un critère doit avoir un poids." };
  const seuil = Math.min(100, Math.max(0, Number(formData.get("seuil")) || 70));
  const lignes = [
    { cle: "plafond_ia_mensuel_usd", valeur: plafond },
    { cle: "ponderations_score", valeur: ponderations },
    { cle: "seuil_alerte_nouvelle_fiche", valeur: seuil },
  ];
  for (const l of lignes) {
    const { error } = await supabase.from("reglages").update({ valeur: l.valeur }).eq("cle", l.cle);
    if (error) return { erreur: error.message };
  }
  revalidatePath("/parametres/couts");
  return { message: `Réglages enregistrés (poids total ${total} : le score est ramené sur 100).` };
}
