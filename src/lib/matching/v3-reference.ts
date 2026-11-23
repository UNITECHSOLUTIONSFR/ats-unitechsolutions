import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { envoyerLotNoteCVComplets, envoyerLotNoteDossiers, envoyerLotReference, lireLotNoteCVComplets, lireLotNoteDossiers, lireLotReference, type UsageIA } from "@/lib/ai";
import { enregistrerUsages } from "@/lib/ai/journal";
import { MODELES } from "@/lib/ai/config";
import { premiersV3, texteMissionIA, textesDossiers } from "./v3";

/**
 * Vérification de la qualité du matching v3 (une fois, avant activation) : pour 15 missions, un modèle plus puissant lit
 * en entier les CV des 20 premiers profils du matching v3 et des 20 premiers du matching actuel, et dit s'il les
 * proposerait. On mesure ensuite combien des 10 premiers de chaque méthode sont « bons ». Lancée par le réglage
 * « reference_v3 » = { etat: "demandee" } ; ≈ 2 $ en lot (moitié prix).
 */
interface EtatReference { etat: "demandee" | "envoyee" | "terminee"; lot?: string; requetes?: Record<string, { mission: string; refs: Record<string, string> }>; missions?: string[] }

const PAR_REQUETE = 8;

export async function textesCV(supabase: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
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
    const v3 = await premiersV3(supabase, m.id, 20);
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

/**
 * Test (une fois) : l'IA note les parcours RÉSUMÉS des profils déjà jugés par la référence, pour mesurer si cette lecture
 * courte (≈ 0,01 $ par mission) retrouve les mêmes bons profils. Lancé par le réglage « test_dossiers » = { etat: "demandee" }.
 */
export async function avancerTestDossiers(supabase: SupabaseClient): Promise<string> {
  const { data: r } = await supabase.from("reglages").select("valeur").eq("cle", "test_dossiers").maybeSingle();
  const etat = (r?.valeur ?? null) as { etat: string; lot?: string; requetes?: Record<string, { mission: string; refs: Record<string, string> }> } | null;
  if (!etat || etat.etat === "terminee") return "rien";
  if (etat.etat === "envoyee" && etat.lot) {
    const lot = await lireLotNoteDossiers(etat.lot);
    if (!lot.termine) return "test en cours";
    const usages: UsageIA[] = [];
    const notes: Record<string, Record<string, { note: number; bon: boolean }>> = {};
    for (const res of lot.resultats) {
      if (res.usage) usages.push(res.usage);
      const req = etat.requetes?.[res.id];
      if (!req || !res.donnees) continue;
      for (const n of res.donnees.notes) {
        const id = req.refs[(n.ref.match(/(\d+)/)?.[1]) ?? ""];
        if (id) (notes[req.mission] ??= {})[id] = { note: Math.round(n.note), bon: n.bon };
      }
    }
    const { error } = await supabase.from("reglages").upsert({ cle: "test_dossiers", valeur: { etat: "terminee", notes } });
    if (error) throw new Error(error.message);
    await enregistrerUsages(usages, "test_dossiers").catch(() => undefined);
    return "test rangé";
  }
  const { data: juges } = await supabase.from("jugements_reference").select("mission_id, consultant_id").limit(5000);
  const parMission = new Map<string, string[]>();
  for (const j of juges ?? []) parMission.set(j.mission_id, [...(parMission.get(j.mission_id) ?? []), j.consultant_id]);
  const requetes: Record<string, { mission: string; refs: Record<string, string> }> = {};
  const aEnvoyer: { id: string; texte: string }[] = [];
  for (const [m, ids] of parMission) {
    const [mission, dossiers] = await Promise.all([texteMissionIA(supabase, m), textesDossiers(supabase, ids)]);
    const avec = ids.filter((id) => dossiers.has(id));
    for (let i = 0; i < avec.length; i += 20) {
      const lot = avec.slice(i, i + 20);
      const id = `${m.slice(0, 8)}-${i / 20}`;
      requetes[id] = { mission: m, refs: Object.fromEntries(lot.map((c, k) => [String(k + 1), c])) };
      aEnvoyer.push({ id, texte: `${mission}\n\nPARCOURS :\n${lot.map((c, k) => `===== P${k + 1} =====\n${dossiers.get(c)}`).join("\n\n")}` });
    }
  }
  if (!aEnvoyer.length) return "rien à tester";
  const lotId = await envoyerLotNoteDossiers(aEnvoyer);
  await supabase.from("reglages").upsert({ cle: "test_dossiers", valeur: { etat: "envoyee", lot: lotId, requetes } });
  return `test envoyé (${aEnvoyer.length} requêtes)`;
}

/**
 * Test n° 2 (une fois) : 1) résumés notés par l'IA pour TOUS les profils jugés (10 par appel, sans réponse coupée) ;
 * 2) CV complets relus pour les profils notés au moins 55 sur leur résumé (20 au plus par mission, 5 par appel).
 * Réglage « test_v3b » = { etat: "demandee" }. Quelques centimes.
 */
type Requetes = Record<string, { mission: string; refs: Record<string, string> }>;
interface EtatTest2 { etat: string; lot?: string; requetes?: Requetes; resumes?: Record<string, Record<string, number>>; complets?: Record<string, Record<string, { note: number; bon: boolean }>> }

function lireNotes(resultats: { id: string; donnees: { notes: { ref: string; note: number; bon: boolean }[] } | null }[], requetes: Requetes) {
  const out: Record<string, Record<string, { note: number; bon: boolean }>> = {};
  for (const res of resultats) {
    const req = requetes[res.id];
    if (!req || !res.donnees) continue;
    for (const n of res.donnees.notes) {
      const id = req.refs[(n.ref.match(/(\d+)/)?.[1]) ?? ""];
      if (id) (out[req.mission] ??= {})[id] = { note: Math.round(n.note), bon: n.bon };
    }
  }
  return out;
}

export async function avancerTestV3b(supabase: SupabaseClient): Promise<string> {
  const { data: r } = await supabase.from("reglages").select("valeur").eq("cle", "test_v3b").maybeSingle();
  const etat = (r?.valeur ?? null) as EtatTest2 | null;
  if (!etat || etat.etat === "terminee") return "rien";
  const sauver = async (v: EtatTest2) => { const { error } = await supabase.from("reglages").upsert({ cle: "test_v3b", valeur: v }); if (error) throw new Error(error.message); };
  if (etat.etat === "resumes_envoyes" && etat.lot) {
    const lot = await lireLotNoteDossiers(etat.lot);
    if (!lot.termine) return "résumés en cours";
    const notes = lireNotes(lot.resultats, etat.requetes ?? {});
    const resumes = Object.fromEntries(Object.entries(notes).map(([m, x]) => [m, Object.fromEntries(Object.entries(x).map(([c, v]) => [c, v.note]))]));
    // Seconde lecture : CV complets des profils notés au moins 55 sur leur résumé.
    const requetes: Requetes = {};
    const aEnvoyer: { id: string; texte: string }[] = [];
    for (const [m, x] of Object.entries(resumes)) {
      const ids = Object.entries(x).filter(([, n]) => n >= 55).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([c]) => c);
      if (!ids.length) continue;
      const [mission, cv] = await Promise.all([texteMissionIA(supabase, m), textesCV(supabase, ids)]);
      const lisibles = ids.filter((c) => (cv.get(c) ?? "").length > 200);
      for (let i = 0; i < lisibles.length; i += 5) {
        const lotIds = lisibles.slice(i, i + 5);
        const id = `${m.slice(0, 8)}-c${i / 5}`;
        requetes[id] = { mission: m, refs: Object.fromEntries(lotIds.map((c, k) => [String(k + 1), c])) };
        aEnvoyer.push({ id, texte: `${mission}\n\n${lotIds.map((c, k) => `===== CV C${k + 1} =====\n${cv.get(c)}`).join("\n\n")}` });
      }
    }
    await enregistrerUsages(lot.resultats.flatMap((x) => (x.usage ? [x.usage] : [])), "test_v3b:resumes").catch(() => undefined);
    if (!aEnvoyer.length) { await sauver({ etat: "terminee", resumes, complets: {} }); return "aucun profil à relire"; }
    const lotId = await envoyerLotNoteCVComplets(aEnvoyer);
    await sauver({ etat: "complets_envoyes", lot: lotId, requetes, resumes });
    return `relecture complète envoyée (${aEnvoyer.length} requêtes)`;
  }
  if (etat.etat === "complets_envoyes" && etat.lot) {
    const lot = await lireLotNoteCVComplets(etat.lot);
    if (!lot.termine) return "relecture complète en cours";
    const complets = lireNotes(lot.resultats, etat.requetes ?? {});
    await sauver({ etat: "terminee", resumes: etat.resumes, complets });
    await enregistrerUsages(lot.resultats.flatMap((x) => (x.usage ? [x.usage] : [])), "test_v3b:complets").catch(() => undefined);
    return "test v3b rangé";
  }
  // Demandé : résumés de tous les profils jugés, 10 par appel.
  const { data: juges } = await supabase.from("jugements_reference").select("mission_id, consultant_id").limit(5000);
  const parMission = new Map<string, string[]>();
  for (const j of juges ?? []) parMission.set(j.mission_id, [...(parMission.get(j.mission_id) ?? []), j.consultant_id]);
  const requetes: Requetes = {};
  const aEnvoyer: { id: string; texte: string }[] = [];
  for (const [m, ids] of parMission) {
    const [mission, dossiers] = await Promise.all([texteMissionIA(supabase, m), textesDossiers(supabase, ids)]);
    const avec = ids.filter((id) => dossiers.has(id));
    for (let i = 0; i < avec.length; i += 10) {
      const lotIds = avec.slice(i, i + 10);
      const id = `${m.slice(0, 8)}-r${i / 10}`;
      requetes[id] = { mission: m, refs: Object.fromEntries(lotIds.map((c, k) => [String(k + 1), c])) };
      aEnvoyer.push({ id, texte: `${mission}\n\nPARCOURS :\n${lotIds.map((c, k) => `===== P${k + 1} =====\n${dossiers.get(c)}`).join("\n\n")}` });
    }
  }
  const lotId = await envoyerLotNoteDossiers(aEnvoyer);
  await sauver({ etat: "resumes_envoyes", lot: lotId, requetes });
  return `résumés envoyés (${aEnvoyer.length} requêtes)`;
}
