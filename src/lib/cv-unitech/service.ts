import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redigerAdequation, structurerCVUnitech, type UsageIA } from "@/lib/ai";
import { enregistrerUsages } from "@/lib/ai/journal";
import { sansAccents } from "@/lib/metier/texte";
import { graphGet, graphTeleverser, listerEnfants, SHAREPOINT, trouverBibliotheque } from "@/lib/sharepoint";
import { genererDocx, nomsFichiers, type CVUnitech } from "./generation";

/** Dossier où sont déposés les essais (validation du rendu avant de généraliser). */
export const DOSSIER_ESSAIS = "General/0 - Recrutement/Sauvegardes ATS/Essais CV Unitech - version 2";

export interface ResultatCVUnitech { word: { nom: string; url: string }; pdf: { nom: string; url: string }; dossier: string; coutUSD: number }

/** Dossier métier SharePoint le plus proche du poste (un sous-dossier par métier), sinon « À classer ». */
export async function dossierMetier(driveId: string, poste: string | null, metierConnu: string | null): Promise<string> {
  const dossiers = (await listerEnfants(driveId, SHAREPOINT.dossierCV)).filter((e) => e.folder).map((e) => e.name);
  const choisir = (t: string | null) => {
    if (!t) return null;
    const p = sansAccents(t).toLowerCase();
    return dossiers.find((d) => sansAccents(d).toLowerCase() === p) ?? dossiers.find((d) => p.includes(sansAccents(d).toLowerCase())) ?? null;
  };
  return choisir(metierConnu) ?? choisir(poste) ?? "À classer";
}

/**
 * Produit le Word Unitech nominatif et le PDF Unitech anonymisé d'un consultant, à partir de son CV (n'importe quel format),
 * avec la section « Adéquation à la mission » si une mission est donnée. Les deux fichiers sont déposés dans SharePoint
 * (dossier métier, ou dossier d'essais) sans jamais écraser un fichier existant.
 */
export async function genererCVUnitech(supabase: SupabaseClient, consultantId: string, options: { missionId?: string | null; essai?: boolean } = {}): Promise<ResultatCVUnitech> {
  const usages: UsageIA[] = [];
  try {
    const [{ data: c }, { data: docs }] = await Promise.all([
      supabase.from("consultants").select("prenom, nom, trigramme, intitule_poste").eq("id", consultantId).single(),
      supabase.from("documents").select("texte_extrait, metier_dossier, type, modifie_sharepoint_le").eq("consultant_id", consultantId)
        .eq("texte_extractible", true).not("texte_extrait", "is", null).in("type", ["word_nominatif", "autre"]).order("modifie_sharepoint_le", { ascending: false }).limit(1),
    ]);
    if (!c) throw new Error("Fiche introuvable.");
    const source = docs?.[0];
    if (!source?.texte_extrait) throw new Error("Aucun CV lisible pour cette fiche.");

    const cv = await structurerCVUnitech(source.texte_extrait);
    usages.push(...cv.usages);
    let section = "Profil", resume = cv.donnees.resume, points = cv.donnees.points_forts, suffixe: string | undefined;
    if (options.missionId) {
      const { data: m } = await supabase.from("missions").select("intitule, client, texte_besoin").eq("id", options.missionId).single();
      if (m) {
        const a = await redigerAdequation(`${m.intitule}${m.client ? ` — ${m.client}` : ""}\n${m.texte_besoin ?? ""}`, cv.donnees);
        usages.push(...a.usages);
        section = `Adéquation à la mission – ${m.client ?? m.intitule}`;
        ({ resume, points } = a.donnees);
        suffixe = m.client ?? m.intitule;
      }
    }
    const contenu: CVUnitech = {
      trigramme: c.trigramme, titre: cv.donnees.titre, annees_experience: cv.donnees.annees_experience,
      adequation: { section, resume, points },
      competences_metier: cv.donnees.competences_metier, outils: cv.donnees.outils, langues: cv.donnees.langues,
      formations: cv.donnees.formations, experiences: cv.donnees.experiences,
    };
    const gabarit = await readFile(path.join(process.cwd(), "src/lib/cv-unitech/gabarit-unitech.docx"));
    const docx = await genererDocx(gabarit, contenu);

    const driveId = await trouverBibliotheque();
    const dossier = options.essai ? DOSSIER_ESSAIS : `${SHAREPOINT.dossierCV}/${await dossierMetier(driveId, cv.donnees.titre, source.metier_dossier)}`;
    const noms = nomsFichiers(c.prenom === "—" ? "" : c.prenom, c.nom, c.trigramme, cv.donnees.titre, suffixe);
    const word = await graphTeleverser(driveId, `${dossier}/${noms.word}`, docx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", fetch, "rename");
    // PDF : conversion par Microsoft (rendu identique au Word, polices comprises).
    const pdf = await graphGet<Buffer>(`drives/${driveId}/items/${word.id}/content?format=pdf`, { brut: true });
    const pdfDepose = await graphTeleverser(driveId, `${dossier}/${noms.pdf}`, pdf, "application/pdf", fetch, "rename");
    return { word: { nom: word.name, url: word.webUrl }, pdf: { nom: pdfDepose.name, url: pdfDepose.webUrl }, dossier, coutUSD: usages.reduce((s, u) => s + u.cout_estime_usd, 0) };
  } finally {
    await enregistrerUsages(usages, `cv_unitech:${consultantId}`);
  }
}

/**
 * CV reçus par email : chaque nuit, jusqu'à 10 nouvelles fiches reçoivent leur Word et leur PDF Unitech, déposés dans le dossier
 * métier de SharePoint. Ne tourne que si l'administratrice a validé le rendu (réglage « cv_unitech_depot_metier »).
 */
export async function deposerCVEmails(supabase: SupabaseClient, limite = 10) {
  const { data: reglage } = await supabase.from("reglages").select("valeur").eq("cle", "cv_unitech_depot_metier").maybeSingle();
  if (reglage?.valeur !== true && reglage?.valeur !== "true") return { actif: false, deposes: 0 };
  const { data: fiches } = await supabase.from("consultants").select("id").eq("source", "email").is("cv_unitech_le", null)
    .gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString()).order("created_at").limit(limite);
  let deposes = 0;
  const erreurs: string[] = [];
  for (const f of fiches ?? []) {
    try {
      await genererCVUnitech(supabase, f.id);
      deposes++;
    } catch (e) {
      erreurs.push((e as Error).message.slice(0, 120));
    }
    // Marqué même en cas d'échec (CV sans texte…) pour ne pas réessayer chaque nuit.
    await supabase.from("consultants").update({ cv_unitech_le: new Date().toISOString() }).eq("id", f.id);
  }
  return { actif: true, deposes, erreurs: erreurs.slice(0, 5) };
}
