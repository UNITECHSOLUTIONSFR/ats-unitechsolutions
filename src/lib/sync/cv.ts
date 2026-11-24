import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { analyserNomFichier, listerFichiersCV, trouverBibliotheque, type FichierCV } from "@/lib/sharepoint";
import { normaliserNomPersonne } from "@/lib/metier/texte";
import { fichesNomSouple } from "@/lib/metier/rapprochement-nom";

export interface BilanSynchroCV {
  fichiers: number;
  nouveaux: number;
  modifies: number;
  supprimes: number;
  associes: number;
  sansPdf: number;
  fichesReliees: number;
  fichesCreees: number;
  /** CV qu'on ne sait pas rattacher : alerte « CV à rattacher » (décision 8A). */
  aRattacher?: number;
}

interface Doc {
  id: string;
  type: string;
  sharepoint_item_id: string;
  modifie_sharepoint_le: string | null;
  consultant_id: string | null;
  document_associe_id: string | null;
  metier_dossier: string | null;
  nom_fichier: string;
  supprime_sharepoint: boolean;
}

const ETAT = "cv:premiere-synchro";

/**
 * Synchronisation des CV SharePoint (lecture seule) :
 * 1. référence les fichiers nouveaux ou modifiés, marque ceux qui ont disparu ;
 * 2. associe chaque Word Unitech nominatif au PDF anonymisé de même trigramme, dans le même dossier métier ;
 * 3. relie le Word (et son PDF) à la fiche consultant de même prénom + nom ;
 *    pour un CV déposé après la mise en service sans fiche existante, crée la fiche (alerte « coordonnées à compléter »).
 * L'analyse par l'IA des CV nouveaux ou modifiés est faite ensuite (analyse-cv/coeur).
 */
export async function synchroniserCV(supabase: SupabaseClient): Promise<BilanSynchroCV> {
  const bilan: BilanSynchroCV = { fichiers: 0, nouveaux: 0, modifies: 0, supprimes: 0, associes: 0, sansPdf: 0, fichesReliees: 0, fichesCreees: 0 };
  const driveId = await trouverBibliotheque();
  const fichiers = await listerFichiersCV(driveId);
  bilan.fichiers = fichiers.length;

  const { data: etat } = await supabase.from("sharepoint_etat").select("lien_delta").eq("drive_id", ETAT).maybeSingle();
  const miseEnService = etat?.lien_delta ?? null; // date du premier passage : seuls les CV déposés après créent des fiches

  const docs = await tous<Doc>(supabase, "documents", "id, type, sharepoint_item_id, modifie_sharepoint_le, consultant_id, document_associe_id, metier_dossier, nom_fichier, supprime_sharepoint", (q) => q.eq("sharepoint_drive_id", driveId));
  const parItem = new Map(docs.map((d) => [d.sharepoint_item_id, d]));
  const presents = new Set(fichiers.map((f) => f.id));

  // 1. Fichiers nouveaux, modifiés, supprimés
  const nouveaux: Record<string, unknown>[] = [];
  for (const f of fichiers) {
    const a = analyserNomFichier(f.name);
    if (a.type === "autre") continue;
    const type = a.type === "pdf_anonyme" && !a.trigramme ? "autre" : a.type; // PDF nommé avec le nom : CV d'origine
    const existant = parItem.get(f.id);
    if (!existant) {
      nouveaux.push({
        type, sharepoint_drive_id: driveId, sharepoint_item_id: f.id, chemin: f.cheminRelatif, url_web: f.webUrl,
        nom_fichier: f.name, metier_dossier: f.metier, modifie_sharepoint_le: f.lastModifiedDateTime, statut_association: "non_traite",
      });
    } else if (!memeDate(existant.modifie_sharepoint_le, f.lastModifiedDateTime) || existant.nom_fichier !== f.name || existant.supprime_sharepoint) {
      // Contenu modifié : l'empreinte est effacée, l'analyse sera refaite (seulement si le contenu a vraiment changé).
      await supabase.from("documents").update({
        nom_fichier: f.name, chemin: f.cheminRelatif, url_web: f.webUrl, metier_dossier: f.metier,
        modifie_sharepoint_le: f.lastModifiedDateTime, supprime_sharepoint: false,
      }).eq("id", existant.id);
      bilan.modifies++;
    }
  }
  for (let i = 0; i < nouveaux.length; i += 500) {
    const { error } = await supabase.from("documents").insert(nouveaux.slice(i, i + 500));
    if (!error) bilan.nouveaux += Math.min(500, nouveaux.length - i);
  }
  const disparus = docs.filter((d) => !presents.has(d.sharepoint_item_id) && !d.supprime_sharepoint).map((d) => d.id);
  for (let i = 0; i < disparus.length; i += 300) {
    await supabase.from("documents").update({ supprime_sharepoint: true }).in("id", disparus.slice(i, i + 300));
  }
  bilan.supprimes = disparus.length;

  // 2 et 3. Association et rattachement des Word qui n'en ont pas encore
  const aJour = await tous<Doc>(supabase, "documents", "id, type, sharepoint_item_id, modifie_sharepoint_le, consultant_id, document_associe_id, metier_dossier, nom_fichier, supprime_sharepoint", (q) => q.eq("sharepoint_drive_id", driveId).eq("supprime_sharepoint", false));
  const pdfs = aJour.filter((d) => d.type === "pdf_anonyme");
  const pdfsParCle = new Map<string, Doc[]>();
  for (const p of pdfs) {
    const t = analyserNomFichier(p.nom_fichier).trigramme;
    if (!t) continue;
    const k = `${p.metier_dossier}|${t}`;
    pdfsParCle.set(k, [...(pdfsParCle.get(k) ?? []), p]);
  }
  const fiches = await tous<{ id: string; prenom: string; nom: string; source?: string }>(supabase, "consultants", "id, prenom, nom, source");
  const creeesDepuisSharePoint = new Set(fiches.filter((f) => f.source === "sharepoint").map((f) => f.id));
  const parNom = new Map<string, string[]>();
  for (const c of fiches) {
    const k = normaliserNomPersonne(c.prenom, c.nom);
    parNom.set(k, [...(parNom.get(k) ?? []), c.id]);
  }
  const fichierParItem = new Map(fichiers.map((f) => [f.id, f]));
  // CV Unitech produits par l'outil : rattachés à la fiche pour laquelle ils ont été faits, quel que soit le nom du fichier.
  const { data: generes } = await supabase.from("cv_unitech_generes").select("consultant_id, word_item_id").not("word_item_id", "is", null);
  const ficheDuGenere = new Map((generes ?? []).map((g) => [g.word_item_id as string, g.consultant_id as string]));

  for (const w of aJour.filter((d) => d.type === "word_nominatif")) {
    const a = analyserNomFichier(w.nom_fichier);
    const maj: Record<string, unknown> = {};

    let consultantId = w.consultant_id;
    const genere = ficheDuGenere.get(w.sharepoint_item_id);
    // Jamais retiré d'une fiche choisie par l'équipe : seulement d'une fiche vide ou créée automatiquement depuis SharePoint.
    if (genere && genere !== consultantId && (!consultantId || creeesDepuisSharePoint.has(consultantId))) { consultantId = genere; maj.consultant_id = genere; bilan.fichesReliees++; }
    if (!consultantId && a.prenom && a.nom) {
      let ids = parNom.get(normaliserNomPersonne(a.prenom, a.nom)) ?? [];
      // Nom écrit un peu autrement (particule, nom composé) : rattaché si une seule fiche convient ; plusieurs = pas de création.
      const souples = ids.length ? [] : fichesNomSouple(a.prenom, a.nom, fiches);
      if (!ids.length && souples.length === 1) ids = souples;
      if (ids.length === 1) { consultantId = ids[0]; bilan.fichesReliees++; }
      else if (miseEnService && estPosterieur(fichierParItem.get(w.sharepoint_item_id), miseEnService)) {
        // Décision 8A (24/11/2026) : plus aucune fiche créée automatiquement. Le CV attend dans « Cas à vérifier »
        // (« CV à rattacher »), avec les fiches qui pourraient correspondre, et l'équipe le rattache en un clic.
        const proches = (ids.length ? ids : souples.length ? souples : fiches.filter((f) => calculerTrigrammeSimple(f.prenom, f.nom) === a.trigramme).map((f) => f.id)).slice(0, 5);
        const { data: deja } = await supabase.from("alertes").select("id").eq("type", "cv_a_rattacher").eq("document_id", w.id).eq("statut", "ouverte").limit(1);
        if (!deja?.length) {
          await supabase.from("alertes").insert({ type: "cv_a_rattacher", document_id: w.id, details: {
            fichier: w.nom_fichier, motif: ids.length > 1 || souples.length > 1 ? "plusieurs fiches possibles" : "aucune fiche trouvée",
            suggestions: proches.map((id) => { const f = fiches.find((x) => x.id === id); return { id, nom: f ? `${f.prenom} ${f.nom}` : id }; }),
          } });
          bilan.aRattacher = (bilan.aRattacher ?? 0) + 1;
        }
      }
      if (consultantId) maj.consultant_id = consultantId;
    }

    if (!w.document_associe_id && a.trigramme) {
      const candidats = (pdfsParCle.get(`${w.metier_dossier}|${a.trigramme}`) ?? [])
        .sort((x, y) => (y.modifie_sharepoint_le ?? "").localeCompare(x.modifie_sharepoint_le ?? ""));
      if (candidats.length) {
        maj.document_associe_id = candidats[0].id;
        maj.statut_association = "associe_auto";
        maj.association_methode = "nom_fichier";
        maj.association_details = { versions_pdf: candidats.length };
        await supabase.from("documents").update({ document_associe_id: w.id, statut_association: "associe_auto", consultant_id: consultantId }).eq("id", candidats[0].id).is("document_associe_id", null);
        bilan.associes++;
      } else {
        maj.statut_association = "sans_correspondance";
        bilan.sansPdf++;
      }
    } else if (w.document_associe_id && consultantId && !w.consultant_id) {
      await supabase.from("documents").update({ consultant_id: consultantId }).eq("id", w.document_associe_id).is("consultant_id", null);
    }
    if (Object.keys(maj).length) await supabase.from("documents").update(maj).eq("id", w.id);
  }

  if (!miseEnService) await supabase.from("sharepoint_etat").upsert({ drive_id: ETAT, lien_delta: new Date().toISOString() });
  return bilan;
}

function estPosterieur(f: FichierCV | undefined, date: string): boolean {
  const cree = f?.createdDateTime ?? f?.lastModifiedDateTime;
  return !!cree && cree > date;
}

/** Lit toutes les lignes d'une table, par pages de 1 000. */
async function tous<T>(
  supabase: SupabaseClient,
  table: string,
  colonnes: string,
  filtre: (q: ReturnType<ReturnType<SupabaseClient["from"]>["select"]>) => ReturnType<ReturnType<SupabaseClient["from"]>["select"]> = (q) => q,
): Promise<T[]> {
  const lignes: T[] = [];
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await filtre(supabase.from(table).select(colonnes)).range(debut, debut + 999);
    if (error) throw new Error(error.message);
    lignes.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return lignes;
}

/** La base renvoie « 2026-01-01T10:00:00+00:00 », Graph « 2026-01-01T10:00:00Z » : on compare les instants, pas les textes. */
export function memeDate(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return a === b;
  return new Date(a).getTime() === new Date(b).getTime();
}

/** Trigramme sans dépendance (1re lettre du prénom + 2 premières du nom, sans accents) pour proposer des fiches proches. */
function calculerTrigrammeSimple(prenom: string, nom: string): string {
  const net = (t: string) => (t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z]/g, "").toUpperCase();
  return `${net(prenom).slice(0, 1)}${net(nom).slice(0, 2)}`;
}

