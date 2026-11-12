import "server-only";
import { randomUUID } from "node:crypto";
import { extraireProfilCV, ErreurIA } from "@/lib/ai";
import { enregistrerUsages, etatBudgetMois } from "@/lib/ai/journal";
import { enregistrerProfil } from "@/lib/analyse-cv/enregistrement";
import { deposerCVRecu } from "@/lib/emails/depot";
import { resoudreCompetences } from "@/lib/matching/competences";
import { empreinteSHA256, extraireTexte } from "@/lib/sharepoint";
import { clientSupabaseAdmin } from "@/lib/supabase/admin";

const EXTENSIONS = ["pdf", "docx", "doc"];

/**
 * CV joint à la création d'une fiche : texte lu, fichier rangé dans SharePoint (« Candidatures reçues »),
 * compétences analysées par l'IA (≈ 0,005 $) pour que le profil sorte dans la recherche et le matching.
 * Renvoie un message d'avertissement si une étape n'a pas abouti (la fiche reste créée).
 */
export async function ajouterCVJoint(consultantId: string, fichier: File, personne: { prenom: string; nom: string }): Promise<string | null> {
  const ext = fichier.name.toLowerCase().split(".").pop() ?? "";
  if (!EXTENSIONS.includes(ext)) return "CV ignoré : formats acceptés PDF ou Word.";
  if (fichier.size > 4 * 1024 * 1024) return "CV ignoré : 4 Mo au maximum.";
  const admin = clientSupabaseAdmin();
  const contenu = Buffer.from(await fichier.arrayBuffer());
  const extrait = await extraireTexte(contenu, fichier.name).catch(() => ({ texte: "", extractible: false }));
  const maintenant = new Date().toISOString();
  const { data: doc, error } = await admin.from("documents").insert({
    consultant_id: consultantId, type: "word_nominatif", sharepoint_drive_id: "boite:manuel", sharepoint_item_id: `manuel/${randomUUID()}`,
    nom_fichier: fichier.name, empreinte_sha256: empreinteSHA256(contenu), texte_extrait: extrait.texte || null,
    texte_extractible: extrait.extractible, modifie_sharepoint_le: maintenant, statut_association: "non_traite",
  }).select("id").single();
  if (error || !doc) return "Le CV n'a pas pu être enregistré.";
  await deposerCVRecu(admin, doc.id, contenu, fichier.name, personne, maintenant).catch(() => undefined);
  if (!extrait.extractible) return "CV enregistré, mais illisible (scanné ?) : compétences non analysées.";
  if ((await etatBudgetMois()).depasse) return "CV enregistré ; analyse des compétences reportée (plafond IA du mois atteint).";
  try {
    const r = await extraireProfilCV(extrait.texte);
    await enregistrerUsages(r.usages, `cv-manuel:${doc.id}`);
    const correspondance = await resoudreCompetences(admin, r.donnees.competences.map((c) => c.nom));
    await enregistrerProfil(admin, consultantId, doc.id, r.donnees, r.modele, correspondance);
    return null;
  } catch (e) {
    const usages = (e as { usages?: Parameters<typeof enregistrerUsages>[0] }).usages;
    if (usages) await enregistrerUsages(usages, `cv-manuel:${doc.id}`);
    return e instanceof ErreurIA ? "CV enregistré ; analyse des compétences impossible." : "CV enregistré ; analyse des compétences à refaire.";
  }
}
