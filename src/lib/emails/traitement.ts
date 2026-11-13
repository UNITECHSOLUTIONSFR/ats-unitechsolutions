import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extraireProfilCV, ErreurIA, lireDocumentScanne, type UsageIA } from "@/lib/ai";
import { MODELES } from "@/lib/ai/config";
import { enregistrerUsages, etatBudgetMois } from "@/lib/ai/journal";
import { enregistrerProfil } from "@/lib/analyse-cv/enregistrement";
import { resoudreCompetences } from "@/lib/matching/competences";
import { normaliserEmail } from "@/lib/metier/dedoublonnage";
import { normaliserTelephone } from "@/lib/metier/telephone";
import { normaliserNomPersonne } from "@/lib/metier/texte";
import { calculerTrigramme } from "@/lib/metier/trigramme";
import { empreinteSHA256, extraireTexte } from "@/lib/sharepoint";
import { envoiCorrespondant, traiterReponse } from "@/lib/relance/reponses";
import { envoiActif } from "@/lib/relance/modele";
import { deposerCVRecu } from "./depot";
import { BOITE_CANDIDATURES, estInterne, messagesDepuis, piecesJointesCV, type MessageBoite, type PieceJointe } from "./boite";

export interface BilanEmails {
  lus: number;
  candidatures: number;
  dejaConnues: number;
  ignores: number;
  erreurs: string[];
  coutUSD: number;
  restants: boolean;
  /** Réponses à la relance des disponibilités appliquées. */
  reponsesRelance?: number;
}

type Statut = "candidature_traitee" | "non_candidature" | "sans_piece_jointe" | "erreur";

/**
 * Traite les nouveaux emails de la boîte ATS Candidatures (client « serveur », clé secrète).
 * Chaque email n'est lu qu'une fois (identifiant conservé). Sans IA : emails internes et emails sans CV joint.
 * Un CV déjà connu (même empreinte) n'est pas réanalysé. Seuls l'expéditeur, la date, l'objet et l'identifiant sont gardés.
 */
export async function traiterEmails(supabase: SupabaseClient, options: { depuisJours?: number; limite?: number } = {}): Promise<BilanEmails> {
  const bilan: BilanEmails = { lus: 0, candidatures: 0, dejaConnues: 0, ignores: 0, erreurs: [], coutUSD: 0, restants: false };
  const limite = options.limite ?? 25;

  // Point de départ : le dernier email traité (ou N jours en arrière au premier passage).
  // (hors reprise de l'historique du groupe, dont les dates ne disent rien de la boîte ATS)
  const { data: dernier } = await supabase.from("emails_entrants").select("recu_le").not("message_id", "like", "groupe:%").order("recu_le", { ascending: false }).limit(1).maybeSingle();
  const depuis = dernier?.recu_le ?? new Date(Date.now() - (options.depuisJours ?? 30) * 86_400_000).toISOString();
  const messages = await messagesDepuis(new Date(depuis).toISOString(), limite + 50);
  const { data: connus } = await supabase.from("emails_entrants").select("message_id").in("message_id", messages.map(cle));
  const dejaVus = new Set((connus ?? []).map((m) => m.message_id));
  const aTraiter = messages.filter((m) => !dejaVus.has(cle(m)));
  bilan.restants = aTraiter.length > limite;

  const usages: UsageIA[] = [];
  const origine = { driveId: `boite:${BOITE_CANDIDATURES}` };
  for (const m of aTraiter.slice(0, limite)) await traiterMessage(supabase, m, () => piecesJointesCV(m.id), origine, usages, bilan);

  await enregistrerUsages(usages, origine.driveId);
  bilan.coutUSD = usages.reduce((s, u) => s + u.cout_estime_usd, 0);
  return bilan;
}

/** Où le CV reste stocké (pas d'écriture SharePoint en V1) : la boîte ATS ou le groupe recrutement. */
export interface OrigineCV {
  driveId: string;
  /** Faux : le fichier n'est pas déposé dans SharePoint (reprise d'une boîte personnelle) ; la fiche affiche le texte du CV. */
  deposer?: boolean;
}

/**
 * Traite un email (boîte ATS ou message du groupe recrutement) et le note dans emails_entrants.
 * Sans IA : expéditeur interne, pas de CV joint, CV déjà connu (même empreinte).
 */
export async function traiterMessage(
  supabase: SupabaseClient, m: MessageBoite, piecesJointes: () => Promise<PieceJointe[]>, origine: OrigineCV, usages: UsageIA[], bilan: BilanEmails,
): Promise<void> {
  bilan.lus++;
  let statut: Statut = "non_candidature";
  let consultantId: string | null = null;
  try {
    const expediteur = m.from?.emailAddress?.address?.toLowerCase();
    // Réponse à une relance des disponibilités : la fiche est mise à jour automatiquement (puis un éventuel CV joint est traité).
    if (envoiActif() && !estInterne(expediteur)) {
      const envoi = await envoiCorrespondant(supabase, m);
      if (envoi) {
        await traiterReponse(supabase, m, envoi, usages);
        consultantId = envoi.consultant_id;
        bilan.reponsesRelance = (bilan.reponsesRelance ?? 0) + 1;
      }
    }
    const cvs = !estInterne(expediteur) && m.hasAttachments ? await piecesJointes() : [];
    if (estInterne(expediteur)) statut = "non_candidature";
    else if (!cvs.length) statut = "sans_piece_jointe";
    else {
      const r = await traiterCandidature(supabase, m, cvs[0], origine, usages);
      statut = r.statut;
      consultantId = r.consultantId;
      if (r.dejaConnu) bilan.dejaConnues++;
    }
  } catch (e) {
    statut = "erreur";
    bilan.erreurs.push(`${m.subject ?? "(sans objet)"} : ${(e as Error).message}`);
  }
  if (statut === "candidature_traitee") bilan.candidatures++;
  else if (statut !== "erreur") bilan.ignores++;
  await supabase.from("emails_entrants").insert({
    message_id: cle(m), expediteur: m.from?.emailAddress?.address ?? null, recu_le: m.receivedDateTime,
    objet: m.subject, statut, consultant_id: consultantId,
  });
}

const cle = (m: MessageBoite) => m.internetMessageId || m.id;

/** Lecture d'un CV scanné par l'IA ; renvoie « extractible » si un vrai texte de CV en ressort. */
export async function lireScan(contenu: Buffer, nom: string, usages: UsageIA[]): Promise<{ texte: string; extractible: boolean }> {
  const ext = nom.toLowerCase().split(".").pop();
  const type = ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : null;
  if (!type || contenu.length > 20 * 1024 * 1024) return { texte: "", extractible: false };
  try {
    const r = await lireDocumentScanne(contenu, type);
    usages.push(...r.usages);
    return { texte: r.texte.slice(0, 30_000), extractible: r.texte.replace(/\[illisible\]/g, "").trim().length >= 200 };
  } catch {
    return { texte: "", extractible: false };
  }
}

export async function traiterCandidature(
  supabase: SupabaseClient,
  m: MessageBoite,
  pj: { id: string; name: string; contentBytes?: string },
  origine: OrigineCV,
  usages: UsageIA[],
): Promise<{ statut: Statut; consultantId: string | null; dejaConnu?: boolean }> {
  const contenu = Buffer.from(pj.contentBytes ?? "", "base64");
  const empreinte = empreinteSHA256(contenu);

  // Même fichier déjà reçu (transfert, relance dans le fil) : rattaché, sans nouvel appel à l'IA.
  const { data: connu } = await supabase.from("documents").select("consultant_id").eq("empreinte_sha256", empreinte).not("consultant_id", "is", null).limit(1).maybeSingle();
  if (connu) return { statut: "candidature_traitee", consultantId: connu.consultant_id, dejaConnu: true };

  let extrait = await extraireTexte(contenu, pj.name);
  // CV scanné (PDF ou image sans texte) : l'IA en recopie le texte, puis le circuit normal reprend.
  if (!extrait.extractible) extrait = await lireScan(contenu, pj.name, usages);
  if (!extrait.extractible) {
    await supabase.from("alertes").insert({ type: "cv_illisible", details: { email: m.subject, fichier: pj.name } });
    return { statut: "erreur", consultantId: null };
  }

  const budget = await etatBudgetMois();
  if (budget.depasse) throw new Error("plafond IA du mois atteint");
  let r;
  try {
    r = await extraireProfilCV(extrait.texte);
    usages.push(...r.usages);
  } catch (e) {
    usages.push(...((e as { usages?: UsageIA[] }).usages ?? []));
    if (e instanceof ErreurIA) return { statut: "non_candidature", consultantId: null }; // pas un CV exploitable
    throw e;
  }
  const p = r.donnees;

  // Fiche : email du CV, sinon celui de l'expéditeur ; puis téléphone ; sinon nouvelle fiche.
  const email = normaliserEmail(p.email) ?? normaliserEmail(m.from?.emailAddress?.address);
  const tel = normaliserTelephone(p.telephone);
  let consultantId: string | null = null;
  if (email) consultantId = (await supabase.from("consultants").select("id").eq("email", email).maybeSingle()).data?.id ?? null;
  if (!consultantId && tel.e164) consultantId = (await supabase.from("consultants").select("id").eq("telephone_e164", tel.e164).limit(1).maybeSingle()).data?.id ?? null;

  const [prenomExp, ...nomExp] = (m.from?.emailAddress?.name ?? "").split(" ");
  const prenom = p.prenom ?? prenomExp ?? "";
  const nom = p.nom ?? nomExp.join(" ");
  if (!consultantId) {
    const { data: cree, error } = await supabase.from("consultants").insert({
      prenom: prenom || "—", nom, trigramme: calculerTrigramme(prenom, nom), email, telephone_e164: tel.e164,
      telephone_brut: tel.statut === "invalide" ? tel.brut : null, intitule_poste: p.intitule_poste, localisation: p.localisation,
      source: "email", statut: "candidat", dernier_contact_le: m.receivedDateTime,
    }).select("id").single();
    if (error || !cree) throw new Error(error?.message ?? "fiche non créée");
    consultantId = cree.id;
    // Même nom qu'une fiche existante avec d'autres coordonnées : doublon possible, à vérifier à la main.
    const { data: homonymes } = await supabase.from("consultants").select("id, prenom, nom").ilike("nom", nom || "—").neq("id", consultantId);
    const memes = (homonymes ?? []).filter((h) => normaliserNomPersonne(h.prenom, h.nom) === normaliserNomPersonne(prenom, nom));
    if (memes.length) await supabase.from("alertes").insert({ type: "doublon_possible", consultant_id: consultantId, details: { source: "email", fiches_existantes: memes.map((h) => h.id) } });
  } else {
    await supabase.from("consultants").update({ dernier_contact_le: m.receivedDateTime }).eq("id", consultantId);
  }

  // Le CV reste dans la boîte mail (pas d'écriture dans SharePoint en V1) : on garde la référence et le lien vers l'email.
  const { data: doc } = await supabase.from("documents").insert({
    consultant_id: consultantId, type: "word_nominatif", sharepoint_drive_id: origine.driveId,
    sharepoint_item_id: `${m.id}/${pj.id}`, url_web: m.webLink, nom_fichier: pj.name, empreinte_sha256: empreinte,
    texte_extrait: extrait.texte, texte_extractible: true, modifie_sharepoint_le: m.receivedDateTime, statut_association: "non_traite",
  }).select("id").single();
  if (doc) {
    // Le fichier reçu est rangé dans SharePoint : la fiche ouvre le vrai CV (et plus l'email).
    if (origine.deposer !== false) await deposerCVRecu(supabase, doc.id, contenu, pj.name, { prenom, nom }, m.receivedDateTime).catch(() => undefined);
    const correspondance = await resoudreCompetences(supabase, p.competences.map((c) => c.nom));
    await enregistrerProfil(supabase, consultantId as string, doc.id, p, r.modele ?? MODELES.ficheCV, correspondance);
  }
  return { statut: "candidature_traitee", consultantId };
}
