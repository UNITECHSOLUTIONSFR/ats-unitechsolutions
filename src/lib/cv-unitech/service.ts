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

export interface ResultatCVUnitech { id: string; word: { nom: string; url: string }; dossier: string; coutUSD: number }
export interface ResultatPDFUnitech { pdf: { nom: string; url: string } }

/** Familles de métiers : mot repéré dans le poste → nom du dossier à créer s'il n'existe pas encore. */
const METIERS: [RegExp, string][] = [
  [/devops|sre|site reliability/, "Devops"], [/architecte/, "Architecte"], [/developpeur|developer|dev |full ?stack|front|back|ingenieur logiciel|software/, "Developpeur"],
  [/data scientist|machine learning|\bml\b|\bia\b|intelligence artificielle/, "Data Scientist"], [/data|bi\b|business intelligence|etl/, "Data engineer BI"],
  [/business analyst|\bba\b|product owner|\bpo\b|amoa|moa/, "Business Analyst"], [/chef de projet|project manager|directeur de projet/, "Chef de projet"],
  [/pmo/, "PMO & Change Manager"], [/test|qa|recette|qualite logicielle/, "QA"], [/scrum master|coach agile|agile coach/, "Coach Agile"],
  [/rssi|cyber|securite|soc\b|pentest/, "Cyber secu"], [/reseau|systeme|infrastructure|cloud|admin sys/, "Infra et secu"],
  [/salesforce/, "SALESFORCE"], [/sap/, "SAP"], [/tech lead|lead tech/, "Tech Lead"], [/support|helpdesk|service desk/, "Analyste Support"],
];
const SENIORITE = /\b(senior|junior|confirme|confirmee|expert|experte|sr|jr|lead)\b/g;

/**
 * Dossier métier SharePoint du CV (un sous-dossier par métier) : le dossier existant qui correspond au poste ;
 * sinon le métier reconnu (Développeur, Architecte, DevOps…), créé au dépôt s'il n'existe pas encore.
 */
export async function dossierMetier(driveId: string, poste: string | null, metierConnu: string | null): Promise<string> {
  const dossiers = (await listerEnfants(driveId, SHAREPOINT.dossierCV)).filter((e) => e.folder).map((e) => e.name);
  const min = (t: string) => sansAccents(t).toLowerCase();
  const existant = (t: string | null) => {
    if (!t) return null;
    const p = min(t);
    return dossiers.find((d) => min(d) === p) ?? dossiers.find((d) => p.includes(min(d)) && min(d).length >= 3) ?? null;
  };
  const famille = (t: string | null) => {
    if (!t) return null;
    const p = ` ${min(t)} `;
    const f = METIERS.find(([motif]) => motif.test(p))?.[1];
    return f ? dossiers.find((d) => min(d) === min(f)) ?? f : null;
  };
  const propre = (t: string) => t.replace(/[\\/:*?"<>|#%]+/g, " ").replace(SENIORITE, " ").replace(/\s+/g, " ").trim();
  const nouveau = poste ? propre(min(poste)).split(" ").slice(0, 3).join(" ") : "";
  return existant(metierConnu) ?? existant(poste) ?? famille(poste) ?? famille(metierConnu)
    ?? (nouveau ? nouveau.charAt(0).toUpperCase() + nouveau.slice(1) : "À classer");
}

/**
 * Produit le Word Unitech d'un consultant, à partir de son CV (n'importe quel format), avec la section « Adéquation à la mission »
 * si une mission est donnée. Déposé dans le dossier métier de SharePoint (créé s'il n'existe pas), sans jamais écraser un fichier.
 * Le PDF est produit ensuite, à partir du Word tel qu'il est dans SharePoint (voir genererPDFUnitech).
 */
export async function genererCVUnitech(supabase: SupabaseClient, consultantId: string, options: { missionId?: string | null; essai?: boolean; par?: string | null } = {}): Promise<ResultatCVUnitech> {
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
    const dossier = options.essai ? DOSSIER_ESSAIS : `${SHAREPOINT.dossierCV}/${await dossierMetier(driveId, c.intitule_poste ?? cv.donnees.titre, source.metier_dossier)}`;
    const noms = nomsFichiers(c.prenom === "—" ? "" : c.prenom, c.nom, c.trigramme, cv.donnees.titre, suffixe);
    // Dépôt par chemin : le dossier métier est créé par SharePoint s'il n'existe pas encore.
    const word = await graphTeleverser(driveId, `${dossier}/${noms.word}`, docx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", fetch, "rename");
    const coutUSD = usages.reduce((s, u) => s + u.cout_estime_usd, 0);
    // Gardé dans l'outil : la fiche et la mission rouvrent ce Word, et en produisent le PDF quand l'équipe l'a relu.
    const { data: ligne } = await supabase.from("cv_unitech_generes").insert({
      consultant_id: consultantId, mission_id: options.missionId ?? null, word_nom: word.name, word_url: word.webUrl,
      drive_id: driveId, word_item_id: word.id, pdf_nom_prevu: noms.pdf, dossier, cout_usd: coutUSD, par: options.par ?? null,
    }).select("id").single();
    return { id: ligne?.id ?? "", word: { nom: word.name, url: word.webUrl }, dossier, coutUSD };
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
      const g = await genererCVUnitech(supabase, f.id);
      if (g.id) await genererPDFUnitech(supabase, g.id).catch(() => undefined);
      deposes++;
    } catch (e) {
      erreurs.push((e as Error).message.slice(0, 120));
    }
    // Marqué même en cas d'échec (CV sans texte…) pour ne pas réessayer chaque nuit.
    await supabase.from("consultants").update({ cv_unitech_le: new Date().toISOString() }).eq("id", f.id);
  }
  return { actif: true, deposes, erreurs: erreurs.slice(0, 5) };
}

/**
 * PDF Unitech à partir du Word tel qu'il est dans SharePoint (corrections de l'équipe comprises) : conversion par Microsoft
 * (rendu identique au Word), déposée à côté du Word. Un PDF déjà produit pour ce Word est remplacé par la nouvelle version.
 */
export async function genererPDFUnitech(supabase: SupabaseClient, generationId: string): Promise<ResultatPDFUnitech> {
  const { data: g } = await supabase.from("cv_unitech_generes").select("drive_id, word_item_id, word_nom, dossier, pdf_nom_prevu, pdf_nom").eq("id", generationId).single();
  if (!g?.word_item_id || !g.drive_id) throw new Error("Ce CV a été généré avant la séparation Word / PDF : régénérez le Word.");
  let itemId = g.word_item_id as string;
  // Word remplacé par un nouveau fichier du même nom (réenregistré) : retrouvé par son chemin.
  try { await graphGet(`drives/${g.drive_id}/items/${itemId}?$select=id`); }
  catch { itemId = (await graphGet<{ id: string }>(`drives/${g.drive_id}/root:/${g.dossier.split("/").map(encodeURIComponent).join("/")}/${encodeURIComponent(g.word_nom)}?$select=id`)).id; }
  const pdf = await graphGet<Buffer>(`drives/${g.drive_id}/items/${itemId}/content?format=pdf`, { brut: true });
  const nom = (g.pdf_nom as string | null) ?? (g.pdf_nom_prevu as string | null) ?? (g.word_nom as string).replace(/\.docx$/i, ".pdf");
  const depose = await graphTeleverser(g.drive_id as string, `${g.dossier}/${nom}`, pdf, "application/pdf", fetch, "replace");
  await supabase.from("cv_unitech_generes").update({ pdf_nom: depose.name, pdf_url: depose.webUrl, pdf_genere_le: new Date().toISOString(), word_item_id: itemId }).eq("id", generationId);
  return { pdf: { nom: depose.name, url: depose.webUrl } };
}

/** Chaque nuit : un Word Unitech modifié dans SharePoint depuis son dernier PDF reçoit un PDF à jour (30 au plus). */
export async function actualiserPDFUnitech(supabase: SupabaseClient, limite = 30) {
  const { data: lignes } = await supabase.from("cv_unitech_generes").select("id, drive_id, word_item_id, pdf_genere_le")
    .not("pdf_genere_le", "is", null).not("word_item_id", "is", null).order("pdf_genere_le", { ascending: true }).limit(200);
  let misAJour = 0;
  for (const l of lignes ?? []) {
    if (misAJour >= limite) break;
    try {
      const item = await graphGet<{ lastModifiedDateTime: string }>(`drives/${l.drive_id}/items/${l.word_item_id}?$select=lastModifiedDateTime`);
      if (Date.parse(item.lastModifiedDateTime) > Date.parse(l.pdf_genere_le as string) + 60_000) { await genererPDFUnitech(supabase, l.id); misAJour++; }
    } catch { /* Word supprimé ou déplacé : ignoré */ }
  }
  return { pdfMisAJour: misAJour };
}
