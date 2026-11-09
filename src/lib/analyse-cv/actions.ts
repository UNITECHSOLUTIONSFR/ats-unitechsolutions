"use server";

import { revalidatePath } from "next/cache";
import { exigerAdmin } from "@/lib/acces-admin";
import { envoyerLotProfilsCV, lireLotProfilsCV, PROMPT_VERSION } from "@/lib/ai";
import { MODELES } from "@/lib/ai/config";
import { enregistrerUsages, etatBudgetMois } from "@/lib/ai/journal";
import { resoudreCompetences } from "@/lib/matching/competences";
import { empreinteSHA256, extraireTexte, telechargerFichier } from "@/lib/sharepoint";
import { COUT_ESTIME_PAR_CV, cvAAnalyser } from "./selection";

export interface EtatAnalyse {
  message?: string;
  erreur?: string;
}

const PLAFOND_SANS_ACCORD_USD = 5;

/** Étape 1 : télécharge les CV depuis SharePoint, extrait le texte, envoie le lot à l'IA. */
export async function lancerAnalyse(): Promise<EtatAnalyse> {
  const { supabase } = await exigerAdmin();
  const { data: enCours } = await supabase.from("executions").select("id").eq("type", "analyse_cv").eq("statut", "en_cours").limit(1);
  if (enCours?.length) return { erreur: "Une analyse est déjà en cours : récupérez d'abord ses résultats." };

  const aFaire = await cvAAnalyser(supabase);
  if (!aFaire.length) return { message: "Tous les CV reliés sont déjà analysés." };
  const estimation = aFaire.length * COUT_ESTIME_PAR_CV;
  if (estimation > PLAFOND_SANS_ACCORD_USD) return { erreur: `Coût estimé ${estimation.toFixed(2)} $ : au-delà de 5 $, l'accord préalable est requis.` };
  const budget = await etatBudgetMois();
  if (budget.depasse) return { erreur: `Plafond IA du mois atteint (${budget.depense.toFixed(2)} $ / ${budget.plafond} $).` };

  const textes: { id: string; texte: string }[] = [];
  const illisibles: string[] = [];
  const erreurs: string[] = [];
  const file = [...aFaire];
  await Promise.all(Array.from({ length: 6 }, async () => {
    for (let doc = file.shift(); doc; doc = file.shift()) {
      try {
        const contenu = await telechargerFichier(doc.sharepoint_drive_id, doc.sharepoint_item_id);
        const extrait = await extraireTexte(contenu, doc.nom_fichier);
        await supabase.from("documents").update({
          empreinte_sha256: empreinteSHA256(contenu), texte_extrait: extrait.texte, texte_extractible: extrait.extractible,
        }).eq("id", doc.id);
        if (extrait.extractible) textes.push({ id: doc.id, texte: extrait.texte });
        else illisibles.push(doc.id);
      } catch (e) {
        erreurs.push(`${doc.nom_fichier} : ${(e as Error).message}`);
      }
    }
  }));
  if (illisibles.length) {
    const consultants = new Map(aFaire.map((d) => [d.id, d.consultant_id]));
    await supabase.from("alertes").insert(illisibles.map((id) => ({ type: "cv_illisible", document_id: id, consultant_id: consultants.get(id) })));
  }
  if (!textes.length) return { erreur: `Aucun CV lisible. ${erreurs.slice(0, 3).join(" ; ")}` };

  const idLot = await envoyerLotProfilsCV(textes);
  await supabase.from("executions").insert({
    type: "analyse_cv", statut: "en_cours", elements_traites: textes.length, erreurs: erreurs.length,
    rapport: { lot: idLot, envoyes: textes.length, illisibles: illisibles.length, erreurs: erreurs.slice(0, 50), estimation_usd: estimation },
  });
  revalidatePath("/parametres/analyse-cv");
  return { message: `${textes.length} CV envoyés à l'analyse (coût estimé ${estimation.toFixed(2)} $). Récupérez les résultats dans quelques minutes.` };
}

/** Étape 2 : quand le lot est terminé, enregistre les fiches de compétences. */
export async function recupererResultats(): Promise<EtatAnalyse> {
  const { supabase } = await exigerAdmin();
  const { data: execution } = await supabase
    .from("executions").select("id, rapport").eq("type", "analyse_cv").eq("statut", "en_cours")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!execution) return { message: "Aucune analyse en cours." };
  const rapport = execution.rapport as { lot: string };

  const lot = await lireLotProfilsCV(rapport.lot);
  if (!lot.termine) return { message: `Analyse encore en cours (${lot.enCours} CV restants). Réessayez dans quelques minutes.` };

  const ids = lot.resultats.map((r) => r.id);
  const { data: docs } = await supabase.from("documents").select("id, consultant_id").in("id", ids);
  const consultantDe = new Map((docs ?? []).map((d) => [d.id, d.consultant_id as string]));
  const correspondance = await resoudreCompetences(supabase, [...new Set(lot.resultats.flatMap((r) => r.profil?.competences.map((c) => c.nom) ?? []))]);

  let enregistres = 0;
  const echecs: string[] = [];
  for (const r of lot.resultats) {
    const consultantId = consultantDe.get(r.id);
    if (!r.profil || !consultantId) { echecs.push(r.id); continue; }
    const p = r.profil;
    const { error } = await supabase.from("profils").upsert({
      consultant_id: consultantId, document_id: r.id, annees_experience: p.annees_experience, seniorite: p.seniorite,
      secteurs: p.secteurs, langues: p.langues, certifications: p.certifications, resume: p.resume,
      modele: MODELES.ficheCV, prompt_version: PROMPT_VERSION,
    }, { onConflict: "consultant_id" });
    if (error) { echecs.push(r.id); continue; }
    const lignes = new Map<string, { niveau: number | null; annees: number | null }>();
    for (const c of p.competences) {
      const id = correspondance.get(c.nom);
      if (id && !lignes.has(id)) lignes.set(id, { niveau: c.niveau, annees: c.annees });
    }
    await supabase.from("consultant_competences").delete().eq("consultant_id", consultantId);
    if (lignes.size) {
      await supabase.from("consultant_competences").insert([...lignes].map(([competence_id, v]) => ({ consultant_id: consultantId, competence_id, ...v })));
    }
    enregistres++;
  }

  const usages = lot.resultats.flatMap((r) => (r.usage ? [r.usage] : []));
  await enregistrerUsages(usages, `lot:${rapport.lot}`);
  const cout = usages.reduce((s, u) => s + u.cout_estime_usd, 0);
  await supabase.from("executions").update({
    statut: "termine", fin: new Date().toISOString(), erreurs: echecs.length,
    rapport: { ...rapport, enregistres, echecs: echecs.length, cout_usd: cout },
  }).eq("id", execution.id);
  revalidatePath("/parametres/analyse-cv");
  return { message: `${enregistres} CV analysés et enregistrés, ${echecs.length} en échec. Coût réel : ${cout.toFixed(2)} $.` };
}
