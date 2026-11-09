/**
 * Échantillon de l'étape 5 (jalon A) — SharePoint en LECTURE SEULE.
 * 1. choisit N Word nominatifs répartis sur les dossiers métier ;
 * 2. télécharge (en mémoire) ces Word et les PDF candidats, calcule l'empreinte, extrait le texte ;
 * 3. lance l'association Word ↔ PDF ;
 * 4. enregistre les documents dans la table `documents` (+ alertes pour les cas douteux) ;
 * 5. écrit le rapport (noms de personnes) dans le dossier de sortie, hors Git.
 * Usage : npx tsx scripts/echantillon-association.ts <inventaire.json> <dossier-sortie> [N=20]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { telechargerFichier, type FichierCV } from "../src/lib/sharepoint/graph";
import { empreinteSHA256, extraireTexte } from "../src/lib/sharepoint/extraction";
import { analyserNomFichier } from "../src/lib/sharepoint/noms";
import { associer, type DocAssociable } from "../src/lib/sharepoint/association";
import { normaliserNomPersonne } from "../src/lib/metier/texte";

const PROJET = "vobarkpycakqoivzlvck";

/** Requête SQL via l'API de gestion Supabase (jeton injecté par l'environnement). */
async function sql<T = Record<string, unknown>>(query: string): Promise<T[]> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJET}/database/query`, {
    method: "POST",
    headers: { Authorization: "Bearer injecte-par-le-proxy", "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`Supabase ${r.status} : ${(await r.text()).slice(0, 300)}`);
  return r.json() as Promise<T[]>;
}
const q = (v: unknown) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);

async function main() {
  const [inventaire, sortie, nStr] = process.argv.slice(2);
  const N = Number(nStr ?? 20);
  const { driveId, fichiers } = JSON.parse(readFileSync(inventaire, "utf8")) as { driveId: string; fichiers: FichierCV[] };
  const analyses = new Map(fichiers.map((f) => [f.id, analyserNomFichier(f.name)]));
  const words = fichiers.filter((f) => analyses.get(f.id)!.type === "word_nominatif" && f.name.toLowerCase().endsWith(".docx") && analyses.get(f.id)!.trigramme);
  const pdfs = fichiers.filter((f) => analyses.get(f.id)!.type === "pdf_anonyme");

  // Échantillon réparti : un Word par dossier métier à tour de rôle (ordre alphabétique, reproductible).
  const parMetier = new Map<string, FichierCV[]>();
  for (const w of [...words].sort((a, b) => a.name.localeCompare(b.name))) parMetier.set(w.metier ?? "", [...(parMetier.get(w.metier ?? "") ?? []), w]);
  const echantillon: FichierCV[] = [];
  for (let i = 0; echantillon.length < N && [...parMetier.values()].some((l) => l.length > i); i++)
    for (const l of parMetier.values()) if (l[i] && echantillon.length < N) echantillon.push(l[i]);

  // PDF examinés : ceux au même trigramme (partout) + ceux du même dossier métier (pour les suggestions).
  const tris = new Set(echantillon.map((w) => analyses.get(w.id)!.trigramme));
  const metiers = new Set(echantillon.map((w) => w.metier));
  const pdfsUtiles = pdfs.filter((p) => tris.has(analyses.get(p.id)!.trigramme) || metiers.has(p.metier));
  console.log(`${echantillon.length} Word, ${pdfsUtiles.length} PDF à lire`);

  const lus = new Map<string, { sha: string; texte: string; extractible: boolean; erreur?: string }>();
  for (const f of [...echantillon, ...pdfsUtiles]) {
    const contenu = await telechargerFichier(driveId, f.id);
    const t = await extraireTexte(contenu, f.name);
    lus.set(f.id, { sha: empreinteSHA256(contenu), ...t });
  }
  const versDoc = (f: FichierCV): DocAssociable => ({
    id: f.id, nomFichier: f.name, trigramme: analyses.get(f.id)!.trigramme, fonction: analyses.get(f.id)!.fonction,
    metier: f.metier, texte: lus.get(f.id)!.extractible ? lus.get(f.id)!.texte : null,
  });
  const resultats = associer(echantillon.map(versDoc), pdfsUtiles.map(versDoc));

  // Consultant lié : nom exact et unique dans la base (issue de l'import Excel).
  const consultants = await sql<{ id: string; prenom: string; nom: string }>("select id, prenom, nom from consultants");
  const parNom = new Map<string, string[]>();
  for (const c of consultants) { const k = normaliserNomPersonne(c.prenom, c.nom); parNom.set(k, [...(parNom.get(k) ?? []), c.id]); }

  // Écriture : documents (upsert sur l'identifiant SharePoint), liens Word ↔ PDF, alertes.
  const lignes: string[] = [];
  const pdfsAEnregistrer = new Set(resultats.flatMap((r) => [r.pdfId, r.suggestionPdfId, ...r.candidats.map((c) => c.pdfId)]).filter(Boolean) as string[]);
  const parId = new Map(fichiers.map((f) => [f.id, f]));
  const rapport = [];
  for (const r of resultats) {
    const w = parId.get(r.wordId)!;
    const a = analyses.get(w.id)!;
    const ids = parNom.get(normaliserNomPersonne(a.prenom ?? "", a.nom ?? "")) ?? [];
    rapport.push({ word: w.name, metier: w.metier, pdf: r.pdfId ? parId.get(r.pdfId)!.name : null,
      suggestion: r.suggestionPdfId ? parId.get(r.suggestionPdfId)!.name : null, statut: r.statut, methode: r.methode,
      similarite: r.similarite, raison: r.raison, consultant: ids.length === 1 ? "trouvé" : ids.length ? "plusieurs" : "absent",
      texteLisible: lus.get(w.id)!.extractible });
    (r as unknown as { consultantId: string | null }).consultantId = ids.length === 1 ? ids[0] : null;
  }
  const docs = [...echantillon.map((f) => ({ f, type: "word_nominatif" })), ...[...pdfsAEnregistrer].map((id) => ({ f: parId.get(id)!, type: "pdf_anonyme" }))];
  for (const { f, type } of docs) {
    const l = lus.get(f.id)!;
    lignes.push(`(${q(type)}, ${q(driveId)}, ${q(f.id)}, ${q(f.cheminRelatif)}, ${q(f.webUrl)}, ${q(f.name)}, ${q(f.metier)}, ${q(l.sha)}, ${q(l.texte)}, ${l.extractible}, ${q(f.lastModifiedDateTime)})`);
  }
  await sql(`insert into documents (type, sharepoint_drive_id, sharepoint_item_id, chemin, url_web, nom_fichier, metier_dossier, empreinte_sha256, texte_extrait, texte_extractible, modifie_sharepoint_le)
    values ${lignes.join(",\n")}
    on conflict (sharepoint_drive_id, sharepoint_item_id) do update set chemin = excluded.chemin, url_web = excluded.url_web,
      nom_fichier = excluded.nom_fichier, metier_dossier = excluded.metier_dossier, empreinte_sha256 = excluded.empreinte_sha256,
      texte_extrait = excluded.texte_extrait, texte_extractible = excluded.texte_extractible, modifie_sharepoint_le = excluded.modifie_sharepoint_le, updated_at = now()`);
  const did = (itemId: string | null) => (itemId ? `(select id from documents where sharepoint_drive_id = ${q(driveId)} and sharepoint_item_id = ${q(itemId)})` : "null");
  const maj: string[] = [];
  for (const r of resultats as (typeof resultats[number] & { consultantId: string | null })[]) {
    const details = JSON.stringify({ raison: r.raison, suggestion: r.suggestionPdfId, candidats: r.candidats });
    maj.push(`update documents set statut_association = ${q(r.statut)}, association_methode = ${q(r.methode)}, association_similarite = ${r.similarite ?? "null"},
      association_details = ${q(details)}::jsonb, document_associe_id = ${did(r.pdfId)}, consultant_id = ${q(r.consultantId)}::uuid
      where sharepoint_drive_id = ${q(driveId)} and sharepoint_item_id = ${q(r.wordId)};`);
    if (r.pdfId) maj.push(`update documents set statut_association = 'associe_auto', association_methode = ${q(r.methode)}, association_similarite = ${r.similarite ?? "null"},
      document_associe_id = ${did(r.wordId)}, consultant_id = ${q(r.consultantId)}::uuid where sharepoint_drive_id = ${q(driveId)} and sharepoint_item_id = ${q(r.pdfId)};`);
    if (r.statut === "douteux") maj.push(`insert into alertes (type, document_id, consultant_id, details)
      select 'association_douteuse', ${did(r.wordId)}, ${q(r.consultantId)}::uuid, ${q(details)}::jsonb
      where not exists (select 1 from alertes where type = 'association_douteuse' and statut = 'ouverte' and document_id = ${did(r.wordId)});`);
  }
  await sql(maj.join("\n"));
  writeFileSync(`${sortie}/rapport-association.json`, JSON.stringify(rapport, null, 1));
  console.table(rapport.map(({ word, pdf, statut, methode, similarite }) => ({ word: word.slice(0, 50), pdf: pdf?.slice(0, 40) ?? "—", statut, methode, similarite })));
}
main().catch((e) => { console.error(e.message); process.exit(1); });
