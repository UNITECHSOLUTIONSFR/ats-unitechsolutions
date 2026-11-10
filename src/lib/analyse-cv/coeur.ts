import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { envoyerLotProfilsCV, lireLotProfilsCV } from "@/lib/ai";
import { MODELES } from "@/lib/ai/config";
import { enregistrerUsages, etatBudgetMois } from "@/lib/ai/journal";
import { resoudreCompetences } from "@/lib/matching/competences";
import { empreinteSHA256, extraireTexte, telechargerFichier } from "@/lib/sharepoint";
import { COUT_ESTIME_PAR_CV, cvAAnalyser, echecsRecents } from "./selection";
import { enregistrerProfil } from "./enregistrement";

/**
 * Analyse des CV par l'IA, utilisée par les boutons de Paramètres et par la tâche de nuit.
 */
export interface EtatAnalyse {
  message?: string;
  erreur?: string;
}

const PLAFOND_SANS_ACCORD_USD = 5;

/** Étape 1 : télécharge les CV depuis SharePoint, extrait le texte, envoie le lot à l'IA (Batch API). */
export async function envoyerAnalyse(supabase: SupabaseClient): Promise<EtatAnalyse> {
  const { data: enCours } = await supabase.from("executions").select("id").eq("type", "analyse_cv").eq("statut", "en_cours").limit(1);
  if (enCours?.length) return { erreur: "Une analyse est déjà en cours : récupérez d'abord ses résultats." };

  const aFaire = await cvAAnalyser(supabase);
  if (!aFaire.length) return { message: "Tous les CV reliés sont déjà analysés." };
  const estimation = aFaire.length * COUT_ESTIME_PAR_CV;
  if (estimation > PLAFOND_SANS_ACCORD_USD) return { erreur: `Coût estimé ${estimation.toFixed(2)} $ : au-delà de 5 $, l'accord préalable est requis.` };
  const budget = await etatBudgetMois();
  if (budget.depasse) return { erreur: `Plafond IA du mois atteint (${budget.depense.toFixed(2)} $ / ${budget.plafond} $).` };

  const textes: { id: string; texte: string; modele?: string }[] = [];
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
        // Déjà en échec une fois avec Haiku : nouvel essai unique avec le modèle de secours (Sonnet).
        if (extrait.extractible) textes.push({ id: doc.id, texte: extrait.texte, modele: doc.repli ? MODELES.ficheCVRepli : undefined });
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
  return { message: `${textes.length} CV envoyés à l'analyse (coût estimé ${estimation.toFixed(2)} $). Récupérez les résultats dans quelques minutes.` };
}

/** Étape 2 : quand le lot est terminé, enregistre les fiches de compétences. */
export async function collecterAnalyse(supabase: SupabaseClient): Promise<EtatAnalyse> {
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
    if (!(await enregistrerProfil(supabase, consultantId, r.id, r.profil, r.modele ?? MODELES.ficheCV, correspondance))) { echecs.push(r.id); continue; }
    enregistres++;
  }

  const usages = lot.resultats.flatMap((r) => (r.usage ? [r.usage] : []));
  await enregistrerUsages(usages, `lot:${rapport.lot}`);
  const cout = usages.reduce((s, u) => s + u.cout_estime_usd, 0);
  await supabase.from("executions").update({
    statut: "termine", fin: new Date().toISOString(), erreurs: echecs.length,
    rapport: { ...rapport, enregistres, echecs: echecs.length, echecIds: echecs, cout_usd: cout },
  }).eq("id", execution.id);
  // Second échec : signalé pour vérification à la main (CV atypique).
  const deja = await echecsRecents(supabase);
  const definitifs = echecs.filter((id) => (deja.get(id) ?? 0) >= 2);
  if (definitifs.length) {
    const { data: textes } = await supabase.from("documents").select("id, texte_extrait").in("id", definitifs);
    const vide = new Set((textes ?? []).filter((t) => modeleUnitechVide(t.texte_extrait)).map((t) => t.id));
    await supabase.from("alertes").insert(definitifs.map((id) => ({
      type: "cv_illisible", document_id: id, consultant_id: consultantDe.get(id) ?? null,
      details: { motif: vide.has(id) ? MOTIF_MODELE_VIDE : "analyse IA impossible (2 essais)" },
    })));
  }
  return { message: `${enregistres} CV analysés et enregistrés, ${echecs.length} en échec. Coût réel : ${cout.toFixed(2)} $.` };
}

export const MOTIF_MODELE_VIDE = "le fichier SharePoint est le modèle CV Unitech non rempli";

/** Fichier enregistré sous le nom du consultant mais resté au modèle Unitech vierge (textes d'exemple). */
export function modeleUnitechVide(texte: string | null): boolean {
  if (!texte) return false;
  const exemples = ["Diplôme Universitaire de Cambridge", "Rôle du consultant dans le projet", "Contexte de la mission/projet client", "- Détail 1"];
  return exemples.filter((e) => texte.includes(e)).length >= 3;
}
