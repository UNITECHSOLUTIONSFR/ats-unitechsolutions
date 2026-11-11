/**
 * Récupération de tous les CV SharePoint (opération ponctuelle, sans IA).
 *   extraire                 : lit le texte de chaque fichier jamais lu (Word et PDF anonymisés).
 *   rapprocher [--appliquer] : relie chaque CV à sa fiche (email, téléphone, nom, puis ressemblance des textes),
 *                              crée les fiches manquantes ; sans --appliquer, affiche seulement le bilan et un échantillon.
 * Usage : NODE_USE_ENV_PROXY=1 NODE_OPTIONS=--conditions=react-server npx tsx scripts/recuperer-cv.ts <étape>
 * Variables : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, MS_CLIENT_SECRET (jamais affichées).
 */
import { clientSupabaseAdmin } from "../src/lib/supabase/admin";
import { coordonnees, nettoyerIdentite, nomsCompatibles } from "../src/lib/sharepoint/rapprochement";
import { analyserNomFichier, construireVecteurs, cosinus, empreinteSHA256, extraireTexte, telechargerFichier } from "../src/lib/sharepoint";
import { normaliserNomPersonne } from "../src/lib/metier/texte";
import { calculerTrigramme } from "../src/lib/metier/trigramme";

type Doc = { id: string; type: string; consultant_id: string | null; nom_fichier: string; metier_dossier: string | null; texte_extrait: string | null;
  sharepoint_drive_id: string; sharepoint_item_id: string; document_associe_id: string | null };
type Fiche = { id: string; prenom: string; nom: string; email: string | null; email_2: string | null; telephone_e164: string | null; trigramme: string };

const supabase = clientSupabaseAdmin();

async function tous<T>(table: string, colonnes: string, egal?: [string, unknown]): Promise<T[]> {
  const res: T[] = [];
  for (let debut = 0; ; debut += 1000) {
    const base = supabase.from(table).select(colonnes);
    const { data, error } = await (egal ? base.eq(egal[0], egal[1]) : base).range(debut, debut + 999);
    if (error) throw new Error(error.message);
    res.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return res;
}

const COLONNES = "id, type, consultant_id, nom_fichier, metier_dossier, texte_extrait, sharepoint_drive_id, sharepoint_item_id, document_associe_id";

async function extraire() {
  const docs = await tous<Doc & { texte_extractible: boolean | null }>("documents", `${COLONNES}, texte_extractible`, ["supprime_sharepoint", false]);
  const aLire = docs.filter((d) => !d.sharepoint_drive_id.startsWith("boite:") && !d.texte_extrait && d.texte_extractible !== false && /\.(docx|pdf)$/i.test(d.nom_fichier));
  console.log(`${aLire.length} fichier(s) à lire`);
  let lus = 0, illisibles = 0, erreurs = 0;
  const file = [...aLire];
  await Promise.all(Array.from({ length: 6 }, async () => {
    for (let d = file.shift(); d; d = file.shift()) {
      try {
        const contenu = await telechargerFichier(d.sharepoint_drive_id, d.sharepoint_item_id);
        const e = await extraireTexte(contenu, d.nom_fichier);
        await supabase.from("documents").update({ texte_extrait: e.texte, texte_extractible: e.extractible, empreinte_sha256: empreinteSHA256(contenu) }).eq("id", d.id);
        if (e.extractible) lus++; else illisibles++;
      } catch { erreurs++; }
      if ((lus + illisibles + erreurs) % 100 === 0) console.log(`… ${lus + illisibles + erreurs}/${aLire.length}`);
    }
  }));
  console.log(JSON.stringify({ lus, illisibles, erreurs }));
}


async function rapprocher(appliquer: boolean) {
  const docs = (await tous<Doc>("documents", COLONNES, ["supprime_sharepoint", false]))
    .filter((d) => d.type === "word_nominatif" || d.type === "pdf_anonyme");
  const fiches = await tous<Fiche>("consultants", "id, prenom, nom, email, email_2, telephone_e164, trigramme");
  const parEmail = new Map<string, string>(), parTel = new Map<string, string[]>(), parNom = new Map<string, string[]>();
  for (const f of fiches) {
    for (const e of [f.email, f.email_2]) if (e) parEmail.set(e.toLowerCase(), f.id);
    if (f.telephone_e164) parTel.set(f.telephone_e164, [...(parTel.get(f.telephone_e164) ?? []), f.id]);
    const k = normaliserNomPersonne(f.prenom ?? "", f.nom ?? "");
    parNom.set(k, [...(parNom.get(k) ?? []), f.id]);
  }
  const trigrammeDe = new Map(fiches.map((f) => [f.id, f.trigramme]));

  const bilan = { relies_coordonnees: 0, relies_nom: 0, relies_texte: 0, fiches_creees: 0, cv_sur_fiches_creees: 0, homonymes: 0, sans_suite: 0, pdf_associes_word: 0 };
  const echantillon: string[] = [];
  const liaisons: { id: string; consultant_id: string; methode: string }[] = []; // consultant_id « nouveau:clé » = fiche à créer
  const nomDe = (id: string) => { const f = fiches.find((x) => x.id === id); return f ? `${f.prenom} ${f.nom}` : id.replace("nouveau:", "(nouvelle) "); };

  // 1. CV Word nominatifs non reliés : coordonnées du CV, puis nom du fichier.
  const identites = new Map<string, { prenom: string; nom: string; fonction: string | null; email: string | null; tel: string | null } | null>();
  const aComparer: Doc[] = [];
  for (const d of docs.filter((x) => x.type === "word_nominatif" && !x.consultant_id && !x.sharepoint_drive_id.startsWith("boite:"))) {
    const a = analyserNomFichier(d.nom_fichier);
    const c = coordonnees(d.texte_extrait ?? "");
    const parCoord = c.emails.map((e) => parEmail.get(e)).find(Boolean) ?? c.telephones.map((t) => parTel.get(t)).find((ids) => ids?.length === 1)?.[0];
    if (parCoord) { liaisons.push({ id: d.id, consultant_id: parCoord, methode: "coordonnées du CV" }); bilan.relies_coordonnees++; continue; }
    const ident = a.prenom && a.nom ? nettoyerIdentite(`${a.prenom} ${a.nom}`) : null;
    identites.set(d.id, ident ? { ...ident, fonction: a.fonction, email: c.emails[0] ?? null, tel: c.telephones[0] ?? null } : null);
    if (ident) {
      const ids = [...new Set([...(parNom.get(normaliserNomPersonne(ident.prenom, ident.nom)) ?? []), ...(parNom.get(normaliserNomPersonne(ident.nom, ident.prenom)) ?? [])])];
      if (ids.length === 1) { liaisons.push({ id: d.id, consultant_id: ids[0], methode: "nom du fichier" }); bilan.relies_nom++; continue; }
      if (ids.length > 1) bilan.homonymes++;
    }
    aComparer.push(d);
  }

  // 2. Ressemblance des textes avec les CV déjà reliés (Word, PDF, CV reçus par email).
  const lie = new Set(liaisons.map((l) => l.id));
  const reference = docs.filter((d) => d.consultant_id && (d.texte_extrait?.length ?? 0) > 300);
  const pdfs = docs.filter((d) => d.type === "pdf_anonyme" && !d.consultant_id && (d.texte_extrait?.length ?? 0) > 300);
  const textes = new Map<string, string>();
  for (const d of [...reference, ...aComparer, ...pdfs]) if ((d.texte_extrait?.length ?? 0) > 300) textes.set(d.id, d.texte_extrait!.slice(0, 20_000));
  const vecteurs = construireVecteurs(textes);
  const relierParTexte = (d: Doc, refs: { id: string; consultant_id: string }[]): boolean => {
    if (!textes.has(d.id)) return false;
    const meilleurs = new Map<string, number>();
    for (const r of refs) {
      const v = cosinus(vecteurs.get(d.id), vecteurs.get(r.id));
      if (v > (meilleurs.get(r.consultant_id) ?? 0)) meilleurs.set(r.consultant_id, v);
    }
    const [premier, second] = [...meilleurs].sort((x, y) => y[1] - x[1]);
    if (!premier) return false;
    const tri = analyserNomFichier(d.nom_fichier).trigramme;
    const memeTrigramme = !!tri && (trigrammeDe.get(premier[0]) ?? trigrammeNouveau.get(premier[0])) === tri;
    if (premier[1] < (memeTrigramme ? 0.35 : 0.5) || premier[1] - (second?.[1] ?? 0) < 0.12) return false;
    // Fichier nommé : le nom doit ressembler à celui de la fiche (un CV réutilisé comme modèle ne doit pas être mal relié).
    const ident = identites.get(d.id);
    const cible = fiches.find((f) => f.id === premier[0]);
    if (ident && cible && !nomsCompatibles(`${ident.prenom} ${ident.nom}`, `${cible.prenom} ${cible.nom}`)) return false;
    liaisons.push({ id: d.id, consultant_id: premier[0], methode: `texte ${Math.round(premier[1] * 100)} %${memeTrigramme ? " + trigramme" : ""}` });
    lie.add(d.id);
    if (echantillon.length < 25) echantillon.push(`${d.nom_fichier} → ${nomDe(premier[0])} (${Math.round(premier[1] * 100)} %, 2e : ${Math.round((second?.[1] ?? 0) * 100)} %)`);
    return true;
  };
  const trigrammeNouveau = new Map<string, string>();
  const refs1 = reference.map((r) => ({ id: r.id, consultant_id: r.consultant_id! }));
  for (const d of [...aComparer, ...pdfs]) if (relierParTexte(d, refs1)) bilan.relies_texte++;

  // 3. Fiches à créer : CV Word nommés, toujours sans fiche (une seule fiche par personne, même avec plusieurs fichiers).
  const creations = new Map<string, { doc: Doc; prenom: string; nom: string; fonction: string | null; email: string | null; tel: string | null }>();
  for (const d of aComparer.filter((x) => !lie.has(x.id))) {
    const ident = identites.get(d.id);
    if (!ident) { bilan.sans_suite++; continue; }
    const cle = `nouveau:${normaliserNomPersonne(ident.prenom, ident.nom)}`;
    if (!creations.has(cle)) { creations.set(cle, { doc: d, ...ident }); trigrammeNouveau.set(cle, calculerTrigramme(ident.prenom, ident.nom)); }
    liaisons.push({ id: d.id, consultant_id: cle, methode: "fiche créée depuis le CV SharePoint" });
    lie.add(d.id);
  }
  bilan.fiches_creees = creations.size;

  // 4. PDF anonymisés restants : comparés aux CV des fiches créées.
  const refs2 = liaisons.filter((l) => l.consultant_id.startsWith("nouveau:")).map((l) => ({ id: l.id, consultant_id: l.consultant_id }));
  for (const d of pdfs.filter((x) => !lie.has(x.id))) {
    if (relierParTexte(d, refs2)) bilan.cv_sur_fiches_creees++; else bilan.sans_suite++;
  }

  console.log(JSON.stringify(bilan, null, 1));
  console.log("Échantillon (texte) :\n " + echantillon.join("\n "));
  console.log("Échantillon (créations) :\n " + [...creations.values()].slice(0, 25).map((c) => `${c.prenom} ${c.nom} · ${c.fonction ?? "?"} · ${c.email ?? "-"} · ${c.tel ?? "-"}`).join("\n "));
  if (!appliquer) return;

  // Écritures : fiches d'abord, puis rattachement des documents.
  const idReel = new Map<string, string>();
  for (const [cle, c] of creations) {
    const email = c.email && !parEmail.has(c.email) ? c.email : null;
    const { data: cree, error } = await supabase.from("consultants").insert({
      prenom: c.prenom, nom: c.nom, trigramme: calculerTrigramme(c.prenom, c.nom), intitule_poste: c.fonction, metier: c.doc.metier_dossier,
      email, telephone_e164: c.tel, source: "sharepoint", statut: "candidat",
    }).select("id").single();
    if (error || !cree) { console.log("création impossible :", c.prenom, c.nom, error?.message); continue; }
    if (email) parEmail.set(email, cree.id);
    idReel.set(cle, cree.id);
    await supabase.from("consultants_historique").insert({ consultant_id: cree.id, source: "sharepoint", modifications: { creation: { avant: null, apres: c.doc.nom_fichier } } });
  }
  for (const l of liaisons) {
    const consultant = l.consultant_id.startsWith("nouveau:") ? idReel.get(l.consultant_id) : l.consultant_id;
    if (!consultant) continue;
    await supabase.from("documents").update({ consultant_id: consultant, association_details: { rattachement: l.methode, le: new Date().toISOString() } }).eq("id", l.id).is("consultant_id", null);
  }
  // PDF anonymisé et Word d'une même personne : associés l'un à l'autre s'ils ne le sont pas déjà.
  const apres = await tous<Doc>("documents", COLONNES, ["supprime_sharepoint", false]);
  const parPersonne = new Map<string, Doc[]>();
  for (const d of apres) if (d.consultant_id && !d.sharepoint_drive_id.startsWith("boite:")) parPersonne.set(d.consultant_id, [...(parPersonne.get(d.consultant_id) ?? []), d]);
  for (const liste of parPersonne.values()) {
    const w = liste.find((d) => d.type === "word_nominatif" && !d.document_associe_id);
    const p = liste.find((d) => d.type === "pdf_anonyme" && !d.document_associe_id);
    if (!w || !p) continue;
    await supabase.from("documents").update({ document_associe_id: p.id, statut_association: "associe_auto", association_methode: "similarite" }).eq("id", w.id);
    await supabase.from("documents").update({ document_associe_id: w.id, statut_association: "associe_auto", association_methode: "similarite" }).eq("id", p.id);
    bilan.pdf_associes_word++;
  }
  console.log("Écrit :", JSON.stringify(bilan));
}



const etape = process.argv[2];
(etape === "extraire" ? extraire() : etape === "rapprocher" ? rapprocher(process.argv.includes("--appliquer")) : Promise.reject(new Error("Étape inconnue")))
  .catch((e) => { console.error(e.message); process.exit(1); });
