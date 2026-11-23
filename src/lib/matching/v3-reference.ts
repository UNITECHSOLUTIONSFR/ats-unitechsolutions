import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { envoyerLotReference, lireLotReference, type UsageIA } from "@/lib/ai";
import { enregistrerUsages } from "@/lib/ai/journal";
import { MODELES } from "@/lib/ai/config";
import { classerMissionV3 } from "./v3";

/**
 * Vérification de la qualité du matching v3 (une fois, avant activation) : pour 15 missions, un modèle plus puissant lit
 * en entier les CV des 20 premiers profils du matching v3 et des 20 premiers du matching actuel, et dit s'il les
 * proposerait. On mesure ensuite combien des 10 premiers de chaque méthode sont « bons ». Lancée par le réglage
 * « reference_v3 » = { etat: "demandee" } ; ≈ 2 $ en lot (moitié prix).
 */
interface EtatReference { etat: "demandee" | "envoyee" | "terminee"; lot?: string; requetes?: Record<string, { mission: string; refs: Record<string, string> }>; missions?: string[] }

const PAR_REQUETE = 8;

async function textesCV(supabase: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const [{ data }, { data: fiches }] = await Promise.all([
    supabase.from("dossiers_cv").select("consultant_id, documents(texte_extrait)").in("consultant_id", ids),
    supabase.from("consultants").select("id, prenom, nom").in("id", ids),
  ]);
  const noms = new Map((fiches ?? []).map((f) => [f.id as string, [f.prenom, ...String(f.nom ?? "").split(/\s+/)].filter((x) => x && x !== "—" && x.length > 2) as string[]]));
  // CV envoyés sans nom ni coordonnées (emails, téléphones, nom et prénom retirés).
  const anonyme = (id: string, t: string) => (noms.get(id) ?? []).reduce((acc, n) => acc.replace(new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "[nom]"), t)
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]").replace(/(?:\+33\s?|0)[1-9](?:[ .-]?\d{2}){4}/g, "[téléphone]");
  return new Map((data ?? []).map((d) => [d.consultant_id as string,
    anonyme(d.consultant_id as string, String((d.documents as unknown as { texte_extrait: string } | null)?.texte_extrait ?? "")).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").slice(0, 9000)]));
}

export async function avancerReference(supabase: SupabaseClient): Promise<string> {
  const { data: r } = await supabase.from("reglages").select("valeur").eq("cle", "reference_v3").maybeSingle();
  const etat = (r?.valeur ?? null) as EtatReference | null;
  if (!etat || etat.etat === "terminee") return "rien";
  if (etat.etat === "envoyee" && etat.lot) {
    const lot = await lireLotReference(etat.lot);
    if (!lot.termine) return `lot de référence en cours (${lot.enCours})`;
    const usages: UsageIA[] = [];
    const lignes: Record<string, unknown>[] = [];
    for (const res of lot.resultats) {
      if (res.usage) usages.push(res.usage);
      const req = etat.requetes?.[res.id];
      if (!req || !res.donnees) continue;
      for (const j of res.donnees.jugements) {
        const id = req.refs[(j.ref.match(/(\d+)/)?.[1]) ?? ""];
        if (id) lignes.push({ mission_id: req.mission, consultant_id: id, bon: j.bon, note: Math.round(j.note), raison: j.raison.slice(0, 300), modele: MODELES.reference, updated_at: new Date().toISOString() });
      }
    }
    if (lignes.length) await supabase.from("jugements_reference").upsert(lignes);
    const { error: e } = await supabase.from("reglages").upsert({ cle: "reference_v3", valeur: { etat: "terminee", missions: etat.missions, jugements: lignes.length } });
    if (e) throw new Error(e.message);
    await enregistrerUsages(usages, "reference_v3").catch(() => undefined);
    return `référence rangée (${lignes.length} jugements)`;
  }
  // Demandée : 15 missions suivies qui ont des critères, les plus récentes.
  const { data: missions } = await supabase.from("missions").select("id, intitule, client, texte_besoin")
    .in("statut", ["ouverte", "chez_client"]).not("criteres_matching", "is", null).order("created_at", { ascending: false }).limit(15);
  const requetes: Record<string, { mission: string; refs: Record<string, string> }> = {};
  const aEnvoyer: { id: string; texte: string }[] = [];
  for (const m of missions ?? []) {
    const v3 = (await classerMissionV3(supabase, m.id)).filter((l) => !l.resultat.elimine).slice(0, 20).map((l) => l.consultant_id);
    const { data: c } = await supabase.from("classements_mission").select("ordre").eq("mission_id", m.id).maybeSingle();
    const actuel = ((c?.ordre ?? []) as [string, number, number][]).slice(0, 20).map((o) => o[0]);
    const ids = [...new Set([...v3, ...actuel])];
    const cv = await textesCV(supabase, ids);
    const lisibles = ids.filter((id) => (cv.get(id) ?? "").length > 200);
    const mission = `MISSION : ${m.intitule}${m.client ? ` — ${m.client}` : ""}\n${String(m.texte_besoin ?? "").replace(/(tjm|taux journalier|tarif)[^\n]*/gi, "").slice(0, 6000)}`;
    for (let i = 0; i < lisibles.length; i += PAR_REQUETE) {
      const lot = lisibles.slice(i, i + PAR_REQUETE);
      const id = `${m.id.slice(0, 8)}-${i / PAR_REQUETE}`;
      requetes[id] = { mission: m.id, refs: Object.fromEntries(lot.map((cid, k) => [String(k + 1), cid])) };
      aEnvoyer.push({ id, texte: `${mission}\n\n${lot.map((cid, k) => `===== CV C${k + 1} =====\n${cv.get(cid)}`).join("\n\n")}` });
    }
  }
  if (!aEnvoyer.length) return "aucune mission à vérifier";
  const lotId = await envoyerLotReference(aEnvoyer);
  await supabase.from("reglages").upsert({ cle: "reference_v3", valeur: { etat: "envoyee", lot: lotId, requetes, missions: (missions ?? []).map((m) => m.id) } });
  return `lot de référence envoyé (${aEnvoyer.length} requêtes)`;
}
