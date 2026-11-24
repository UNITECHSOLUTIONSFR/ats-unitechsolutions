import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { envoyerLotProfilsCV, lireLotProfilsCV, type UsageIA } from "@/lib/ai";
import { enregistrerUsages, etatBudgetMois } from "@/lib/ai/journal";
import { enregistrerProfil } from "@/lib/analyse-cv/enregistrement";
import { COUT_ESTIME_PAR_CV } from "@/lib/analyse-cv/selection";
import { traiterCV } from "@/lib/consultants/cv-arriere-plan";
import { ESPACE_ADEQUATIONS } from "@/lib/cv-unitech/service";
import { deposerCVRecu } from "@/lib/emails/depot";
import { resoudreCompetences } from "@/lib/matching/competences";
import { cheminCVCollective } from "./fichier";
import { actualiserProjection } from "@/lib/tableau/projection";

/** Compte de l'administratrice qui a demandé l'import (historique des fiches). */
const ACTEUR = "db7f1a37-f71c-4aa2-98f8-30cd67874ca4";

/**
 * Candidats Collective (décisions du 24/11/2026) : chaque CV suit le circuit normal d'un CV ajouté à la main :
 * - le PDF est rangé dans l'espace privé de l'outil et s'ouvre depuis la fiche (/api/documents/[id]/fichier) ;
 * - il est déposé dans SharePoint, « Candidatures reçues » (le dossier métier ne reçoit que le CV Word Unitech) ;
 * - le parcours est lu par l'IA EN LOT DE NUIT (moitié prix), seulement pour les offres actives (lecture_ia) ;
 *   les candidats des offres expirées n'ont aucune lecture par l'IA tant que le budget n'est pas rechargé.
 * L'ancienne copie « texte seul » est retirée de la fiche (marquée supprimée, rien n'est effacé).
 * La nuit (19 h - 6 h, heure de Paris), plusieurs CV sont traités en même temps.
 */
const heureParis = () => Number(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false }).format(new Date()));
const enParallele = () => { const h = heureParis(); return h >= 19 || h < 6 ? 8 : 1; };

async function telecharger(lien: string): Promise<{ contenu: Buffer; type: string }> {
  const r = await fetch(lien);
  if (!r.ok) throw new Error(`téléchargement refusé (${r.status})`);
  return { contenu: Buffer.from(await r.arrayBuffer()), type: r.headers.get("content-type") ?? "application/pdf" };
}

/** Range le PDF dans l'outil et fait pointer le document de la fiche vers lui. */
async function rangerFichier(supabase: SupabaseClient, applicationId: string, contenu: Buffer, type: string): Promise<void> {
  const identifiant = `collective-cv:${applicationId}`;
  const { error } = await supabase.storage.from(ESPACE_ADEQUATIONS).upload(cheminCVCollective(identifiant)!, contenu, { contentType: type, upsert: true });
  if (error) throw new Error(`rangement du CV impossible : ${error.message}`);
  const { data: doc } = await supabase.from("documents").select("id").eq("sharepoint_item_id", identifiant).maybeSingle();
  if (doc) await supabase.from("documents").update({ url_web: `/api/documents/${doc.id}/fichier` }).eq("id", doc.id);
}

/** Dépôt dans SharePoint (« Candidatures reçues »), comme un CV ajouté à la main ; la fiche garde le lien vers l'outil. */
async function deposer(supabase: SupabaseClient, it: { application_id: string; consultant_id: string; nom_fichier: string }): Promise<void> {
  const identifiant = `collective-cv:${it.application_id}`;
  const [{ data: doc }, { data: c }, fichier] = await Promise.all([
    supabase.from("documents").select("id, url_web, created_at").eq("sharepoint_item_id", identifiant).maybeSingle(),
    supabase.from("consultants").select("prenom, nom").eq("id", it.consultant_id).maybeSingle(),
    supabase.storage.from(ESPACE_ADEQUATIONS).download(cheminCVCollective(identifiant)!),
  ]);
  if (!doc || !c || fichier.error || !fichier.data) throw new Error("CV introuvable dans l'outil");
  await deposerCVRecu(supabase, doc.id, Buffer.from(await fichier.data.arrayBuffer()), it.nom_fichier, { prenom: c.prenom, nom: c.nom }, doc.created_at as string);
  await supabase.from("documents").update({ url_web: doc.url_web }).eq("id", doc.id);
  await supabase.from("imports_collective").update({ depose_le: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("application_id", it.application_id);
}

type Element = { application_id: string; consultant_id: string; cv_lien: string; nom_fichier: string };

async function traiterUn(supabase: SupabaseClient, it: Element): Promise<boolean> {
  try {
    const { contenu, type } = await telecharger(it.cv_lien);
    const nom = /\.(pdf|docx?)$/i.test(it.nom_fichier) ? it.nom_fichier : `${it.nom_fichier}.pdf`;
    const message = await traiterCV(it.consultant_id, new File([new Uint8Array(contenu)], nom, { type }), ACTEUR,
      { deposer: false, sansIA: true, sansProjection: true, urlWeb: it.cv_lien, origine: "collective", identifiant: `collective-cv:${it.application_id}` });
    await rangerFichier(supabase, it.application_id, contenu, type);
    await supabase.from("documents").update({ supprime_sharepoint: true }).eq("sharepoint_item_id", `collective:${it.application_id}`);
    await supabase.from("imports_collective").update({ statut: "fait", message, traite_le: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("application_id", it.application_id);
    await deposer(supabase, it).catch((e) => console.error("Dépôt SharePoint (Collective) :", (e as Error).message));
    return true;
  } catch (e) {
    await supabase.from("imports_collective").update({ statut: "erreur", message: (e as Error).message.slice(0, 300), traite_le: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("application_id", it.application_id);
    return false;
  }
}

/** Parcours des CV des offres actives, lu par l'IA en lot de nuit (envoi, puis enregistrement quand le lot est fini). */
async function avancerParcours(supabase: SupabaseClient): Promise<string> {
  const { data: r } = await supabase.from("reglages").select("valeur").eq("cle", "collective_lot_parcours").maybeSingle();
  const lot = r?.valeur as { lot: string; documents: Record<string, { application_id: string; consultant_id: string }> } | null;
  if (lot?.lot) {
    const res = await lireLotProfilsCV(lot.lot);
    if (!res.termine) return `lot de parcours en cours (${res.enCours})`;
    const usages: UsageIA[] = [];
    let enregistres = 0;
    for (const x of res.resultats) {
      if (x.usage) usages.push(x.usage);
      const cible = lot.documents[x.id];
      if (!cible) continue;
      if (x.profil && x.modele) {
        const correspondance = await resoudreCompetences(supabase, x.profil.competences.map((c) => c.nom));
        await enregistrerProfil(supabase, cible.consultant_id, x.id, x.profil, x.modele, correspondance);
        const { data: c } = await supabase.from("consultants").select("intitule_poste, localisation, experience").eq("id", cible.consultant_id).maybeSingle();
        const complements: Record<string, unknown> = {};
        if (c && !c.intitule_poste && x.profil.intitule_poste) complements.intitule_poste = x.profil.intitule_poste;
        if (c && !c.localisation && x.profil.localisation) complements.localisation = x.profil.localisation;
        if (c && !c.experience && x.profil.annees_experience) complements.experience = `${x.profil.annees_experience} ans`;
        if (Object.keys(complements).length) await supabase.from("consultants").update(complements).eq("id", cible.consultant_id);
        enregistres++;
      }
      await supabase.from("imports_collective").update({ parcours_le: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("application_id", cible.application_id);
    }
    await enregistrerUsages(usages, `collective-parcours:${lot.lot}`).catch(() => undefined);
    await supabase.from("reglages").delete().eq("cle", "collective_lot_parcours");
    return `parcours enregistrés : ${enregistres}`;
  }
  const { data: prets } = await supabase.from("imports_collective").select("application_id, consultant_id").eq("statut", "fait").eq("lecture_ia", true).is("parcours_le", null).limit(400);
  if (!prets?.length) return "aucun parcours à lire";
  const budget = await etatBudgetMois();
  if (budget.depasse) return "plafond IA atteint : parcours reportés";
  // Ne jamais dépasser le plafond du jour avec un lot : seulement ce que le reste du budget couvre.
  const reste = budget.plafondJour === null ? budget.plafond - budget.depense : Math.min(budget.plafond - budget.depense, budget.plafondJour - budget.jour);
  const nombre = Math.max(0, Math.floor(reste / COUT_ESTIME_PAR_CV) - 1);
  const choisis = prets.slice(0, nombre);
  if (!choisis.length) return "budget du jour insuffisant : parcours reportés";
  const { data: docs } = await supabase.from("documents").select("id, sharepoint_item_id, texte_extrait")
    .in("sharepoint_item_id", choisis.map((p) => `collective-cv:${p.application_id}`)).eq("texte_extractible", true);
  const parId = new Map(choisis.map((p) => [`collective-cv:${p.application_id}`, p]));
  const textes = (docs ?? []).filter((d) => d.texte_extrait).map((d) => ({ id: d.id as string, texte: d.texte_extrait as string }));
  if (!textes.length) return "aucun texte lisible";
  const id = await envoyerLotProfilsCV(textes);
  const documents = Object.fromEntries((docs ?? []).filter((d) => d.texte_extrait).map((d) => [d.id, parId.get(d.sharepoint_item_id as string)!]));
  await supabase.from("reglages").upsert({ cle: "collective_lot_parcours", valeur: { lot: id, documents } });
  return `lot de parcours envoyé (${textes.length} CV)`;
}

export async function traiterImportsCollective(supabase: SupabaseClient, budgetMs = 200_000): Promise<Record<string, unknown>> {
  const debut = Date.now();
  // 1. CV en attente : par paquets (plusieurs à la fois la nuit).
  let faits = 0, erreurs = 0;
  const n = enParallele();
  while (Date.now() - debut < budgetMs) {
    const { data: paquet } = await supabase.from("imports_collective").select("application_id, consultant_id, cv_lien, nom_fichier").eq("statut", "a_traiter").order("created_at").limit(n);
    if (!paquet?.length) break;
    // Réservés pour ce passage (un autre passage ne les reprend pas en même temps).
    await supabase.from("imports_collective").update({ statut: "erreur", message: "en cours", updated_at: new Date().toISOString() }).in("application_id", paquet.map((p) => p.application_id));
    const r = await Promise.all(paquet.map((it) => traiterUn(supabase, it as Element)));
    faits += r.filter(Boolean).length; erreurs += r.filter((x) => !x).length;
  }
  // Liste de l'écran Consultants mise à jour une fois pour tout le passage.
  if (faits) await actualiserProjection(supabase).catch(() => undefined);
  // 2. Dépôt SharePoint des CV traités avant cette décision.
  let deposes = 0;
  const { data: aDeposer } = await supabase.from("imports_collective").select("application_id, consultant_id, nom_fichier").eq("statut", "fait").is("depose_le", null).limit(20);
  for (const it of aDeposer ?? []) {
    if (Date.now() - debut > budgetMs + 40_000) break;
    try { await deposer(supabase, it); deposes++; } catch (e) { console.error("Dépôt SharePoint (Collective) :", (e as Error).message); }
  }
  // 3. Parcours (offres actives) en lot de nuit.
  const parcours = await avancerParcours(supabase).catch((e) => `erreur : ${(e as Error).message.slice(0, 200)}`);
  const { count } = await supabase.from("imports_collective").select("application_id", { count: "exact", head: true }).eq("statut", "a_traiter");
  return { faits, erreurs, deposes, parcours, restants: count ?? 0 };
}
