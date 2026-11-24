import "server-only";
import { after } from "next/server";
import { clientSupabaseAdmin } from "@/lib/supabase/admin";
import { normaliserTelephone } from "@/lib/metier/telephone";
import { normaliserEmail } from "@/lib/metier/dedoublonnage";
import { actualiserProjection } from "@/lib/tableau/projection";
import { enregistrerCVJoint, lireCVJoint, type OptionsCV } from "./cv-joint";

/**
 * CV joint lu en arrière-plan (17/11/2026) : la fiche s'ouvre tout de suite, l'IA lit le CV pendant ce temps
 * (≈ 10 à 15 s), puis la fiche se complète toute seule (champs vides, compétences, CV rangé dans SharePoint, matching).
 * La fiche affiche « CV en cours de lecture » tant que consultants.cv_en_lecture est renseigné.
 */
export async function lireCVEnArrierePlan(consultantId: string, fichier: File, utilisateurId: string): Promise<void> {
  // Contenu copié tout de suite : la requête d'origine est terminée quand le travail commence.
  const copie = new File([Buffer.from(await fichier.arrayBuffer())], fichier.name, { type: fichier.type });
  const admin = clientSupabaseAdmin();
  await admin.from("consultants").update({ cv_en_lecture: new Date().toISOString(), cv_lecture_message: null }).eq("id", consultantId);
  const travail = () => traiterCV(consultantId, copie, utilisateurId).catch(async (e) => {
    console.error("CV en arrière-plan :", (e as Error).message);
    await admin.from("consultants").update({ cv_en_lecture: null, cv_lecture_message: "La lecture du CV a échoué : ajoutez-le à nouveau." }).eq("id", consultantId);
  });
  try { after(travail); } catch { await travail(); }
}

/** Circuit normal d'un CV (aussi utilisé pour les candidats Collective, avec leurs options). */
export async function traiterCV(consultantId: string, fichier: File, utilisateurId: string, options: OptionsCV = {}): Promise<string | null> {
  const admin = clientSupabaseAdmin();
  const lecture = await lireCVJoint(fichier, options.sansIA);
  if ("erreur" in lecture) {
    await admin.from("consultants").update({ cv_en_lecture: null, cv_lecture_message: lecture.erreur }).eq("id", consultantId);
    return lecture.erreur;
  }
  const { data: c } = await admin.from("consultants").select("prenom, nom, email, telephone_e164, intitule_poste, localisation, linkedin, experience").eq("id", consultantId).maybeSingle();
  if (!c) return "Fiche introuvable.";
  const avertissement = await enregistrerCVJoint(consultantId, lecture, { prenom: c.prenom, nom: c.nom }, options);
  // Champs laissés vides complétés à partir du CV (ce que l'équipe a saisi reste prioritaire).
  const p = lecture.profil;
  const complements: Record<string, unknown> = {};
  if (!c.intitule_poste && p?.intitule_poste) complements.intitule_poste = p.intitule_poste;
  if (!c.localisation && p?.localisation) complements.localisation = p.localisation;
  if (!c.experience && p?.annees_experience) complements.experience = `${p.annees_experience} ans`;
  if (!c.linkedin && lecture.linkedin) complements.linkedin = /^https?:\/\//i.test(lecture.linkedin) ? lecture.linkedin : `https://${lecture.linkedin}`;
  const alertes: string[] = [];
  // Email et téléphone du CV : repris seulement s'ils n'appartiennent pas déjà à une autre fiche (jamais de doublon).
  if (!c.email && p?.email) {
    const e = normaliserEmail(p.email);
    if (e) {
      const { data: autre } = await admin.from("consultants").select("id").eq("email", e).neq("id", consultantId).limit(1).maybeSingle();
      if (autre) alertes.push(`l'email du CV (${e}) appartient déjà à une autre fiche : doublon possible`); else complements.email = e;
    }
  }
  if (!c.telephone_e164 && p?.telephone) {
    const t = normaliserTelephone(p.telephone);
    if (t.e164) {
      const { data: autre } = await admin.from("consultants").select("id").eq("telephone_e164", t.e164).neq("id", consultantId).limit(1).maybeSingle();
      if (autre) alertes.push("le téléphone du CV appartient déjà à une autre fiche : doublon possible"); else complements.telephone_e164 = t.e164;
    }
  }
  const message = [avertissement, ...alertes].filter(Boolean).join(" ; ") || null;
  await admin.from("consultants").update({ ...complements, cv_en_lecture: null, cv_lecture_message: message }).eq("id", consultantId);
  await admin.from("consultants_historique").insert({
    consultant_id: consultantId, source: "interface", par: utilisateurId,
    modifications: { cv: { avant: null, apres: lecture.nom }, ...Object.fromEntries(Object.entries(complements).map(([k, v]) => [k, { avant: null, apres: v }])) },
  });
  await actualiserProjection(admin).catch(() => undefined);
  const { evaluerProfil } = await import("@/lib/matching/profil");
  await evaluerProfil(consultantId, admin).catch((e) => console.error("Matching du profil :", (e as Error).message));
  return message;
}
