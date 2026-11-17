"use server";

import { revalidatePath } from "next/cache";
import { invaliderTableau } from "@/lib/tableau/cache";
import { redirect } from "next/navigation";
import { calculerTrigramme } from "@/lib/metier/trigramme";
import { exigerUtilisateur } from "@/lib/acces";
import { normaliserTelephone } from "@/lib/metier/telephone";
import { normaliserEmail } from "@/lib/metier/dedoublonnage";
import { enregistrerCVJoint, lireCVJoint } from "./cv-joint";

const STATUTS = ["candidat", "consultant", "en_mission", "inactif"];

/** Modifie une fiche depuis l'interface, en gardant l'historique et la trace dans le journal d'accès. */
export async function modifierConsultant(formData: FormData) {
  const { utilisateur, supabase } = await exigerUtilisateur();
  const id = String(formData.get("id"));
  const CHAMPS_FICHE = "prenom, nom, trigramme, intitule_poste, disponibilite, disponible_le, telephone_e164, telephone_brut, email, email_2, localisation, mobilite, statut, notes, experience, tjm_salaire, linkedin, cv_lien, commentaire_email";
  const [{ data: avant }, { data: profilAvant }, { data: compsAvant }] = await Promise.all([
    supabase.from("consultants").select(CHAMPS_FICHE).eq("id", id).maybeSingle(),
    supabase.from("profils").select("annees_experience, seniorite, resume").eq("consultant_id", id).maybeSingle(),
    supabase.from("consultant_competences").select("competence_id, competences(nom_canonique)").eq("consultant_id", id),
  ]);
  if (!avant) return;

  const texte = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v === "" ? null : v;
  };
  const tel = normaliserTelephone(texte("telephone"));
  const statut = String(formData.get("statut"));
  // Prénom et nom : le nom ne peut pas être vidé. Trigramme : celui saisi, sinon recalculé s'il était calculé
  // (un trigramme repris de l'Excel est gardé tant qu'on ne le change pas).
  const prenom = texte("prenom") ?? avant.prenom;
  const nom = texte("nom") ?? avant.nom;
  const trigrammeAuto = avant.trigramme === calculerTrigramme(avant.prenom, avant.nom);
  const trigrammeSaisi = texte("trigramme")?.toUpperCase().slice(0, 6) ?? null;
  const apres: Record<string, unknown> = {
    prenom, nom,
    trigramme: trigrammeSaisi && trigrammeSaisi !== avant.trigramme ? trigrammeSaisi : trigrammeAuto ? calculerTrigramme(prenom, nom) : avant.trigramme,
    intitule_poste: texte("intitule_poste"),
    disponibilite: texte("disponibilite"),
    disponible_le: texte("disponible_le"),
    telephone_e164: tel.e164 ?? (tel.statut === "vide" ? null : avant.telephone_e164),
    telephone_brut: tel.e164 ? null : tel.statut === "vide" ? null : texte("telephone"),
    email: normaliserEmail(texte("email")) ?? (texte("email") ? avant.email : null),
    email_2: normaliserEmail(texte("email_2")) ?? texte("email_2"),
    localisation: texte("localisation"),
    mobilite: texte("mobilite"),
    statut: STATUTS.includes(statut) ? statut : avant.statut,
    notes: texte("notes"),
    experience: texte("experience"),
    tjm_salaire: texte("tjm_salaire"),
    linkedin: texte("linkedin"),
    cv_lien: texte("cv_lien"),
    commentaire_email: texte("commentaire_email"),
  };

  const modifications: Record<string, { avant: unknown; apres: unknown }> = {};
  for (const [k, v] of Object.entries(apres)) {
    const a = (avant as Record<string, unknown>)[k] ?? null;
    if (String(a ?? "") !== String(v ?? "")) modifications[k] = { avant: a, apres: v };
  }

  // Profil du CV (expérience, séniorité, résumé, compétences) : modifiable aussi.
  const annees = texte("annees_experience");
  const seniorite = texte("seniorite");
  const profil = {
    annees_experience: annees === null ? null : Math.max(0, Math.min(60, Number(annees.replace(",", ".")) || 0)),
    seniorite: ["junior", "confirme", "senior", "expert"].includes(seniorite ?? "") ? seniorite : null,
    resume: texte("resume"),
  };
  for (const [k, v] of Object.entries(profil)) {
    const a = (profilAvant as Record<string, unknown> | null)?.[k] ?? null;
    if (String(a ?? "") !== String(v ?? "")) modifications[`profil.${k}`] = { avant: a, apres: v };
  }
  const nomsAvant = ((compsAvant ?? []) as unknown as { competence_id: string; competences: { nom_canonique: string } | null }[]);
  const saisieCompetences = formData.get("competences");
  const nomsApres = saisieCompetences === null ? null : [...new Set(String(saisieCompetences).split(/[,;\n]/).map((n) => n.trim()).filter(Boolean))].slice(0, 80);
  const listeAvant = nomsAvant.map((c) => c.competences?.nom_canonique ?? "").filter(Boolean);
  const competencesChangees = nomsApres !== null && [...nomsApres].sort().join("|").toLowerCase() !== [...listeAvant].sort().join("|").toLowerCase();
  if (competencesChangees) modifications.competences = { avant: listeAvant, apres: nomsApres };

  // Colonnes du fichier de suivi sans champ dédié (« col:<titre> »).
  const libres: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith("col:")) continue;
    const entete = k.slice(4), valeur = String(v).trim();
    if (formData.get(`avant:${entete}`) !== valeur) libres[entete] = valeur;
  }
  for (const [e, v] of Object.entries(libres)) modifications[`colonne.${e}`] = { avant: formData.get(`avant:${e}`), apres: v };
  if (!Object.keys(modifications).length) return;
  if (modifications.disponibilite || modifications.disponible_le) apres.disponibilite_maj_le = new Date().toISOString();

  const { error } = await supabase.from("consultants").update(apres).eq("id", id);
  if (error) throw new Error(error.message.includes("consultants_email_unique") ? "Cet email est déjà utilisé par une autre fiche." : error.message);
  if (Object.keys(modifications).some((k) => k.startsWith("profil."))) {
    if (profilAvant) await supabase.from("profils").update(profil).eq("consultant_id", id);
    else await supabase.from("profils").insert({ consultant_id: id, ...profil, secteurs: [], langues: [], certifications: [] });
  }
  if (competencesChangees && nomsApres) {
    const { resoudreCompetences } = await import("@/lib/matching/competences");
    const correspondance = await resoudreCompetences(supabase, nomsApres);
    const ids = new Set([...correspondance.values()].flat());
    const aRetirer = nomsAvant.map((c) => c.competence_id).filter((c) => !ids.has(c));
    if (aRetirer.length) await supabase.from("consultant_competences").delete().eq("consultant_id", id).in("competence_id", aRetirer);
    const existants = new Set(nomsAvant.map((c) => c.competence_id));
    const aAjouter = [...ids].filter((c) => !existants.has(c));
    if (aAjouter.length) await supabase.from("consultant_competences").insert(aAjouter.map((competence_id) => ({ consultant_id: id, competence_id })));
  }
  await supabase.from("consultants_historique").insert({ consultant_id: id, source: "interface", modifications, par: utilisateur.id });
  await supabase.from("journal_acces").insert({
    utilisateur_id: utilisateur.id, action: "modification", consultant_id: id, details: { champs: Object.keys(modifications) },
  });

  // Répercussion partout : ligne du tableau et Excel d'origine (cette nuit, en remplaçant la case), fichiers SharePoint
  // si le nom ou le trigramme change, matching (fiche modifiée = empreinte et classements recalculés).
  const { clientSupabaseAdmin } = await import("@/lib/supabase/admin");
  const { renommerFichiers, repercuterFiche } = await import("./propagation");
  const admin = clientSupabaseAdmin();
  await repercuterFiche(admin, id, { ...avant, ...apres }, Object.keys(modifications), libres);
  if (modifications.prenom || modifications.nom || modifications.trigramme) {
    const { after } = await import("next/server");
    after(() => renommerFichiers(id, { prenom: avant.prenom, nom: avant.nom, trigramme: avant.trigramme }, { prenom: String(apres.prenom), nom: String(apres.nom), trigramme: String(apres.trigramme) })
      .then((j) => { if (j.length) return admin.from("consultants_historique").insert({ consultant_id: id, source: "interface", modifications: { fichiers: { avant: null, apres: j } }, par: utilisateur.id }).then(() => undefined); })
      .catch((e) => console.error("Renommage des fichiers :", (e as Error).message)));
  }
  revalidatePath(`/consultants/${id}`);
  invaliderTableau();
  revalidatePath("/consultants");
}

export interface EtatCreation { erreur?: string }

/** Crée une fiche à la main. Elle apparaît dans l'écran Consultants et sera ajoutée au fichier Excel la nuit suivante. */
export async function creerConsultant(_e: EtatCreation, formData: FormData): Promise<EtatCreation> {
  const { utilisateur, supabase } = await exigerUtilisateur();
  const saisi = (k: string) => String(formData.get(k) ?? "").trim() || null;
  // CV joint : lu d'abord ; les champs laissés vides sont remplis à partir du CV (ce que l'équipe a saisi est prioritaire).
  const fichier = formData.get("cv");
  const lecture = fichier instanceof File && fichier.size > 0 ? await lireCVJoint(fichier) : null;
  if (lecture && "erreur" in lecture) return { erreur: lecture.erreur };
  const p = lecture?.profil;
  const duCV: Record<string, string | null> = {
    prenom: p?.prenom ?? null, nom: p?.nom ?? null, email: p?.email ?? null, telephone: p?.telephone ?? null,
    intitule_poste: p?.intitule_poste ?? null, localisation: p?.localisation ?? null,
    experience: p?.annees_experience ? `${p.annees_experience} ans` : null, linkedin: lecture?.linkedin ?? null,
  };
  const texte = (k: string) => saisi(k) ?? duCV[k] ?? null;
  const prenom = texte("prenom"), nom = texte("nom");
  if (!nom) return { erreur: lecture ? "Le nom n'a pas été trouvé dans le CV : saisissez-le." : "Le nom est obligatoire (ou joignez le CV)." };
  const email = normaliserEmail(texte("email"));
  if (texte("email") && !email) return { erreur: "Email invalide." };
  const tel = normaliserTelephone(texte("telephone"));
  // Dédoublonnage : jamais de seconde fiche pour la même personne.
  if (email) {
    const { data } = await supabase.from("consultants").select("id").eq("email", email).maybeSingle();
    if (data) return { erreur: "Une fiche existe déjà avec cet email." };
  }
  if (tel.e164) {
    const { data } = await supabase.from("consultants").select("id").eq("telephone_e164", tel.e164).limit(1).maybeSingle();
    if (data) return { erreur: "Une fiche existe déjà avec ce téléphone." };
  }
  // Trigramme : celui saisi (lettres, 4 au plus), sinon calculé ; date de mise à jour : celle saisie, sinon aujourd'hui si une disponibilité est donnée.
  const trigrammeSaisi = (texte("trigramme") ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
  const dateMaj = /^\d{4}-\d{2}-\d{2}$/.test(texte("date_maj") ?? "") ? new Date(`${texte("date_maj")}T12:00:00Z`).toISOString() : null;
  const statut = ["candidat", "consultant", "inactif"].includes(texte("statut") ?? "") ? texte("statut") : "candidat";
  const linkedin = texte("linkedin");
  const { data: cree, error } = await supabase.from("consultants").insert({
    prenom: prenom ?? "—", nom, trigramme: trigrammeSaisi || calculerTrigramme(prenom ?? "", nom), email, telephone_e164: tel.e164,
    telephone_brut: tel.statut === "invalide" ? tel.brut : null, intitule_poste: texte("intitule_poste"),
    experience: texte("experience"), tjm_salaire: texte("tjm_salaire"),
    disponibilite: texte("disponibilite"), disponibilite_maj_le: dateMaj ?? (texte("disponibilite") ? new Date().toISOString() : null),
    localisation: texte("localisation"), linkedin: linkedin && /^https?:\/\//i.test(linkedin) ? linkedin : linkedin ? `https://${linkedin}` : null,
    notes: texte("notes"), source: "manuel", statut,
  }).select("id").single();
  if (error || !cree) return { erreur: error?.message ?? "Fiche non créée." };
  await supabase.from("journal_acces").insert({ utilisateur_id: utilisateur.id, action: "creation", consultant_id: cree.id, details: {} });
  // CV joint : rangé dans SharePoint, compétences enregistrées (lecture déjà faite) ; la fiche sort dans la recherche et le matching.
  const avertissement = lecture ? await enregistrerCVJoint(cree.id, lecture, { prenom: prenom ?? "—", nom }) : null;
  invaliderTableau();
  revalidatePath("/consultants");
  redirect(`/consultants/${cree.id}${avertissement ? `?cv=${encodeURIComponent(avertissement)}` : ""}`);
}

/** Fusionne deux fiches d'une même personne (administrateurs). La fiche « gardée » reçoit les valeurs choisies et tout le reste. */
export async function fusionnerFiches(formData: FormData) {
  const { utilisateur, supabase } = await exigerUtilisateur();
  if (utilisateur.role !== "admin") throw new Error("Fusion réservée aux administrateurs.");
  const garde = String(formData.get("garde")), supprime = String(formData.get("supprime"));
  const { data: g } = await supabase.from("consultants").select("*").eq("id", garde).maybeSingle();
  if (!g) throw new Error("Fiche introuvable.");
  // Valeur finale de chaque champ (choisie ou saisie) ; seuls les champs qui changent sur la fiche gardée sont envoyés.
  const valeurs: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) {
    if (!k.startsWith("final:")) continue;
    const champ = k.slice(6);
    let val: string | null = String(v).trim() || null;
    if (champ === "telephone_e164") {
      const t = normaliserTelephone(val);
      if (t.statut === "vide") val = null;
      else if (t.e164) val = t.e164;
      else { valeurs.telephone_brut = val; val = null; }
    }
    if ((champ === "email" || champ === "email_2") && val) val = normaliserEmail(val) ?? val;
    if (champ === "trigramme" && val) val = val.toUpperCase().slice(0, 5);
    if (champ === "disponible_le" && val && !/^\d{4}-\d{2}-\d{2}$/.test(val)) continue;
    if (champ === "statut" && (!val || !STATUTS.includes(val))) continue;
    if (champ === "nom" && !val) continue; // le nom ne peut pas être vidé
    const actuel = g[champ] === null || g[champ] === undefined ? null : String(g[champ]).slice(0, champ === "disponible_le" ? 10 : undefined);
    if ((actuel ?? null) !== val) valeurs[champ] = val;
  }
  if (valeurs.disponibilite !== undefined || valeurs.disponible_le !== undefined) valeurs.disponibilite_maj_le = new Date().toISOString();
  const { error } = await supabase.rpc("fusionner_consultants", { p_garde: garde, p_supprime: supprime, p_valeurs: valeurs });
  if (error) throw new Error(error.message);
  revalidatePath("/alertes");
  invaliderTableau();
  revalidatePath("/consultants");
  redirect(`/consultants/${garde}`);
}

/** Ajoute une note datée sur une fiche (visible par toute l'équipe). */
export async function ajouterNote(formData: FormData): Promise<{ ok: boolean }> {
  const { utilisateur, supabase } = await exigerUtilisateur();
  const consultantId = String(formData.get("consultant_id")), texte = String(formData.get("texte") ?? "").trim();
  if (!texte) return { ok: false };
  const { error } = await supabase.from("notes_consultant").insert({ consultant_id: consultantId, texte: texte.slice(0, 2000), auteur: utilisateur.id });
  await supabase.from("consultants").update({ dernier_contact_le: new Date().toISOString() }).eq("id", consultantId);
  revalidatePath(`/consultants/${consultantId}`);
  return { ok: !error };
}

export async function retirerNote(formData: FormData) {
  const { supabase } = await exigerUtilisateur();
  await supabase.from("notes_consultant").delete().eq("id", String(formData.get("id")));
  revalidatePath(`/consultants/${String(formData.get("consultant_id"))}`);
}

export interface EtatAjoutCV { erreur?: string }

/**
 * Ajoute (ou remplace) le CV d'une fiche existante : même chemin qu'à la création (lecture par l'IA, fichier rangé dans SharePoint
 * « Candidatures reçues », compétences et profil mis à jour). Les champs vides de la fiche sont complétés à partir du CV ;
 * ce que l'équipe a déjà saisi n'est jamais remplacé.
 */
export async function ajouterCVConsultant(_e: EtatAjoutCV, formData: FormData): Promise<EtatAjoutCV> {
  const { utilisateur, supabase } = await exigerUtilisateur();
  const id = String(formData.get("id"));
  const fichier = formData.get("cv");
  if (!(fichier instanceof File) || fichier.size === 0) return { erreur: "Choisissez le CV (PDF ou Word)." };
  const { data: c } = await supabase.from("consultants").select("prenom, nom, email, telephone_e164, intitule_poste, localisation, linkedin").eq("id", id).maybeSingle();
  if (!c) return { erreur: "Fiche introuvable." };
  const lecture = await lireCVJoint(fichier);
  if ("erreur" in lecture) return { erreur: lecture.erreur };
  const avertissement = await enregistrerCVJoint(id, lecture, { prenom: c.prenom, nom: c.nom });
  // Champs vides complétés à partir du CV.
  const p = lecture.profil;
  const complements: Record<string, unknown> = {};
  if (!c.intitule_poste && p?.intitule_poste) complements.intitule_poste = p.intitule_poste;
  if (!c.localisation && p?.localisation) complements.localisation = p.localisation;
  if (!c.linkedin && lecture.linkedin) complements.linkedin = lecture.linkedin;
  if (!c.email && p?.email) { const e = normaliserEmail(p.email); if (e) complements.email = e; }
  if (!c.telephone_e164 && p?.telephone) { const t = normaliserTelephone(p.telephone); if (t.e164) complements.telephone_e164 = t.e164; }
  if (Object.keys(complements).length) await supabase.from("consultants").update(complements).eq("id", id);
  await supabase.from("consultants_historique").insert({
    consultant_id: id, source: "interface", par: utilisateur.id,
    modifications: { cv: { avant: null, apres: lecture.nom }, ...Object.fromEntries(Object.entries(complements).map(([k, v]) => [k, { avant: null, apres: v }])) },
  });
  await supabase.from("journal_acces").insert({ utilisateur_id: utilisateur.id, action: "modification", consultant_id: id, details: { cv_ajoute: lecture.nom } });
  invaliderTableau();
  revalidatePath(`/consultants/${id}`);
  revalidatePath("/consultants");
  redirect(`/consultants/${id}${avertissement ? `?cv=${encodeURIComponent(avertissement)}` : ""}`);
}
