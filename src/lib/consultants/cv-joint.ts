import "server-only";
import { randomUUID } from "node:crypto";
import { extraireProfilCV, type ProfilCV, type UsageIA } from "@/lib/ai";
import { enregistrerUsages, etatBudgetMois } from "@/lib/ai/journal";
import { enregistrerProfil } from "@/lib/analyse-cv/enregistrement";
import { deposerCVRecu } from "@/lib/emails/depot";
import { resoudreCompetences } from "@/lib/matching/competences";
import { empreinteSHA256, extraireTexte } from "@/lib/sharepoint";
import { clientSupabaseAdmin } from "@/lib/supabase/admin";

const EXTENSIONS = ["pdf", "docx", "doc"];

export interface LectureCV {
  nom: string;
  contenu: Buffer;
  texte: string;
  extractible: boolean;
  profil: ProfilCV | null;
  modele: string | null;
  linkedin: string | null;
  avertissement: string | null;
}

/**
 * Lit un CV joint (une seule fois) : texte extrait, puis fiche structurée par l'IA (identité, poste, expérience, compétences ; ≈ 0,005 $).
 * Sert à remplir les champs laissés vides du formulaire, puis à enregistrer les compétences.
 */
export async function lireCVJoint(fichier: File): Promise<LectureCV | { erreur: string }> {
  const ext = fichier.name.toLowerCase().split(".").pop() ?? "";
  if (!EXTENSIONS.includes(ext)) return { erreur: "CV refusé : formats acceptés PDF ou Word." };
  if (fichier.size > 4 * 1024 * 1024) return { erreur: "CV refusé : 4 Mo au maximum." };
  const contenu = Buffer.from(await fichier.arrayBuffer());
  const extrait = await extraireTexte(contenu, fichier.name).catch(() => ({ texte: "", extractible: false }));
  const linkedin = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9\-_%]+/i.exec(extrait.texte)?.[0] ?? null;
  const base = { nom: fichier.name, contenu, texte: extrait.texte, extractible: extrait.extractible, linkedin, profil: null, modele: null };
  if (!extrait.extractible) return { ...base, avertissement: "CV enregistré, mais illisible (scanné ?) : champs et compétences non remplis." };
  if ((await etatBudgetMois()).depasse) return { ...base, avertissement: "CV enregistré ; lecture par l'IA reportée (plafond du mois atteint)." };
  let usages: UsageIA[] = [];
  try {
    const r = await extraireProfilCV(extrait.texte);
    usages = r.usages;
    return { ...base, profil: r.donnees, modele: r.modele, avertissement: null };
  } catch (e) {
    usages = (e as { usages?: UsageIA[] }).usages ?? [];
    return { ...base, avertissement: "CV enregistré ; lecture par l'IA impossible, complétez la fiche à la main." };
  } finally {
    await enregistrerUsages(usages, `cv-manuel:${fichier.name.slice(0, 60)}`);
  }
}

/** Enregistre le CV lu sur la fiche : document, fichier rangé dans SharePoint (« Candidatures reçues »), compétences. */
export async function enregistrerCVJoint(consultantId: string, lecture: LectureCV, personne: { prenom: string; nom: string }): Promise<string | null> {
  const admin = clientSupabaseAdmin();
  const maintenant = new Date().toISOString();
  const { data: doc, error } = await admin.from("documents").insert({
    consultant_id: consultantId, type: "word_nominatif", sharepoint_drive_id: "boite:manuel", sharepoint_item_id: `manuel/${randomUUID()}`,
    nom_fichier: lecture.nom, empreinte_sha256: empreinteSHA256(lecture.contenu), texte_extrait: lecture.texte || null,
    texte_extractible: lecture.extractible, modifie_sharepoint_le: maintenant, statut_association: "non_traite",
  }).select("id").single();
  if (error || !doc) return "Le CV n'a pas pu être enregistré.";
  await deposerCVRecu(admin, doc.id, lecture.contenu, lecture.nom, personne, maintenant).catch(() => undefined);
  if (lecture.profil && lecture.modele) {
    const correspondance = await resoudreCompetences(admin, lecture.profil.competences.map((c) => c.nom));
    await enregistrerProfil(admin, consultantId, doc.id, lecture.profil, lecture.modele, correspondance);
  }
  return lecture.avertissement;
}
