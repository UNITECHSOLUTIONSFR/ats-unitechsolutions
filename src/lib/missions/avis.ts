"use server";

import { exigerUtilisateur } from "@/lib/acces";
import { donnerAvisMission, ErreurIA, type AvisMission } from "@/lib/ai";
import { enregistrerUsages, etatBudgetMois } from "@/lib/ai/journal";

export interface EtatAvis { avis?: AvisMission; erreur?: string }

/** Avis de l'IA sur un consultant pour une mission : relu s'il existe déjà (gratuit), sinon demandé une fois (≈ 0,1 centime). */
export async function avisConsultantMission(missionId: string, consultantId: string): Promise<EtatAvis> {
  const { utilisateur, supabase } = await exigerUtilisateur();
  const { data: deja } = await supabase.from("avis_ia").select("contenu").eq("mission_id", missionId).eq("consultant_id", consultantId).maybeSingle();
  if (deja) return { avis: deja.contenu as AvisMission };

  const [{ data: mission }, { data: docs }] = await Promise.all([
    supabase.from("missions").select("intitule, texte_besoin").eq("id", missionId).maybeSingle(),
    supabase.from("documents").select("type, texte_extrait, modifie_sharepoint_le").eq("consultant_id", consultantId).eq("supprime_sharepoint", false)
      .not("texte_extrait", "is", null).order("modifie_sharepoint_le", { ascending: false, nullsFirst: false }).limit(5),
  ]);
  if (!mission) return { erreur: "Mission introuvable." };
  // Le CV nominatif le plus récent, sinon le PDF anonymisé : le plus complet des textes disponibles.
  const cv = [...(docs ?? [])].sort((a, b) => Number(b.type === "word_nominatif") - Number(a.type === "word_nominatif"))
    .find((d) => (d.texte_extrait?.length ?? 0) > 300)?.texte_extrait;
  if (!cv) return { erreur: "Pas de CV lisible pour ce consultant : l'avis n'est pas possible." };
  const budget = await etatBudgetMois();
  if (budget.depasse) return { erreur: "Plafond IA du mois atteint." };
  try {
    const r = await donnerAvisMission(`${mission.intitule}\n\n${mission.texte_besoin ?? ""}`, cv);
    await enregistrerUsages(r.usages, `avis:${missionId}:${consultantId}`);
    await supabase.from("avis_ia").insert({
      mission_id: missionId, consultant_id: consultantId, contenu: r.donnees, par: utilisateur.id,
      cout_usd: r.usages.reduce((s, u) => s + u.cout_estime_usd, 0),
    });
    return { avis: r.donnees };
  } catch (e) {
    const usages = (e as { usages?: Parameters<typeof enregistrerUsages>[0] }).usages;
    if (usages) await enregistrerUsages(usages, `avis:${missionId}:${consultantId}`);
    return { erreur: e instanceof ErreurIA ? e.message : "L'avis n'a pas pu être rédigé. Réessayez dans un instant." };
  }
}
