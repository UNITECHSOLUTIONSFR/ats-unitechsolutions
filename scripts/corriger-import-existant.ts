/**
 * Applique aux données DÉJÀ importées les règles décidées le 9/11/2026, sans réimporter le fichier :
 *  - case email : « Â » → « @ », 2e adresse dans « Email 2 », LinkedIn déplacé, reste en « Commentaire email » ;
 *  - lignes sans nom : fiche créée avec l'alerte « nom manquant ».
 * Passe par l'API de gestion Supabase (jeton injecté par le proxy de la session).
 * Usage : NODE_USE_ENV_PROXY=1 npx tsx scripts/corriger-import-existant.ts [--appliquer]
 */
import { analyserCaseEmail, preparerImport, COLONNE_COMMENTAIRE_EMAIL, COLONNE_EMAIL_2 } from "../src/lib/import/excel";
import { normaliserEmail } from "../src/lib/metier/dedoublonnage";

const PROJET = "vobarkpycakqoivzlvck";
const appliquer = process.argv.includes("--appliquer");

async function sql<T = Record<string, unknown>>(requete: string): Promise<T[]> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJET}/database/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: requete }),
  });
  const texte = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status} : ${texte.slice(0, 300)}`);
  return JSON.parse(texte) as T[];
}
const q = (v: unknown) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const j = (v: unknown) => `${q(JSON.stringify(v))}::jsonb`;

async function main() {
  const [onglet] = await sql<{ id: string; entetes: string[] }>(`select id, entetes from tableau_onglets where principal limit 1`);
  if (!onglet) throw new Error("Aucun onglet principal.");
  const lignes = await sql<{ id: string; position: number; valeurs: Record<string, string>; consultant_id: string | null }>(
    `select id, position, valeurs, consultant_id from tableau_lignes where onglet_id = ${q(onglet.id)} order by position`,
  );
  const fiches = await sql<{ id: string; email: string | null; linkedin: string | null }>(`select id, email, linkedin from consultants`);
  const parId = new Map(fiches.map((f) => [f.id, f]));
  const emailsPris = new Map(fiches.filter((f) => f.email).map((f) => [f.email!, f.id]));

  const enTeteEmail = onglet.entetes.find((e) => /^e-?mail$/i.test(e.trim())) ?? "Email";
  const enTeteLinkedin = onglet.entetes.find((e) => /linked\s*in/i.test(e)) ?? "Linkedin";
  const ordres: string[] = [];
  const entetes = [...onglet.entetes];
  const stats = { emailsCorriges: 0, email2: 0, linkedin: 0, commentaires: 0, conflits: 0, sansNom: 0 };

  for (const l of lignes) {
    const brut = l.valeurs[enTeteEmail];
    if (!brut || normaliserEmail(brut)) continue;
    const a = analyserCaseEmail(brut);
    const v = { ...l.valeurs };
    if (a.email) v[enTeteEmail] = a.email; else delete v[enTeteEmail];
    if (a.email2) { v[COLONNE_EMAIL_2] = a.email2; stats.email2++; }
    let commentaire = a.commentaire;
    if (a.linkedin) {
      if (!v[enTeteLinkedin]) { v[enTeteLinkedin] = a.linkedin; stats.linkedin++; }
      else commentaire = [commentaire, a.linkedin].filter(Boolean).join(" ");
    }
    if (commentaire) { v[COLONNE_COMMENTAIRE_EMAIL] = commentaire; stats.commentaires++; }
    if (a.email) stats.emailsCorriges++;
    ordres.push(`update tableau_lignes set valeurs = ${j(v)} where id = ${q(l.id)};`);
    l.valeurs = v;

    if (l.consultant_id) {
      const f = parId.get(l.consultant_id);
      const maj: string[] = [`email_2 = ${q(a.email2)}`, `commentaire_email = ${q(commentaire)}`];
      if (a.email && (!f?.email || !normaliserEmail(f.email))) {
        const autre = emailsPris.get(a.email);
        if (autre && autre !== l.consultant_id) {
          stats.conflits++;
          ordres.push(`insert into alertes (type, consultant_id, details) values ('doublon_possible', ${q(l.consultant_id)}, ${j({ motif: "même email qu'une autre fiche", email: a.email, autre_fiche: autre })});`);
        } else { maj.push(`email = ${q(a.email)}`); emailsPris.set(a.email, l.consultant_id); }
      }
      if (a.linkedin && !f?.linkedin && v[enTeteLinkedin] === a.linkedin) maj.push(`linkedin = ${q(a.linkedin)}`);
      ordres.push(`update consultants set ${maj.join(", ")} where id = ${q(l.consultant_id)};`);
    }
  }
  for (const c of [COLONNE_EMAIL_2, COLONNE_COMMENTAIRE_EMAIL]) {
    if (!entetes.includes(c) && lignes.some((l) => l.valeurs[c])) entetes.push(c);
  }
  if (entetes.length !== onglet.entetes.length) ordres.push(`update tableau_onglets set entetes = ${q(`{${entetes.map((e) => `"${e.replace(/"/g, '\\"')}"`).join(",")}}`)} where id = ${q(onglet.id)};`);

  // Lignes sans fiche (sans nom) : fiche créée, reliée à la ligne du tableau, avec l'alerte « nom manquant ».
  for (const l of lignes.filter((x) => !x.consultant_id)) {
    const cellules = onglet.entetes.map((e) => l.valeurs[e] ?? null);
    const { fiches: [f] } = preparerImport(onglet.entetes, [cellules]);
    if (!f) continue;
    stats.sansNom++;
    const id = crypto.randomUUID();
    const email = f.email && !emailsPris.has(f.email) ? f.email : null;
    ordres.push(`insert into consultants (id, prenom, nom, trigramme, email, telephone_e164, telephone_brut, intitule_poste, disponibilite, localisation, notes, experience, tjm_salaire, linkedin, cv_lien, email_2, commentaire_email, source, donnees_excel)
      values (${q(id)}, ${q(f.prenom || "—")}, '', ${q(f.trigramme)}, ${q(email)}, ${q(f.telephone_e164)}, ${q(f.telephone_brut)}, ${q(f.intitule_poste)}, ${q(f.disponibilite)}, ${q(f.localisation)}, ${q(f.notes)}, ${q(f.experience)}, ${q(f.tjm_salaire)}, ${q(f.linkedin)}, ${q(f.cv_lien)}, ${q(f.email_2)}, ${q(f.commentaire_email)}, 'import_excel', ${j([{ ligne: l.position, valeurs: l.valeurs }])});`);
    ordres.push(`update tableau_lignes set consultant_id = ${q(id)} where id = ${q(l.id)};`);
    ordres.push(`insert into alertes (type, consultant_id, details) values ('nom_manquant', ${q(id)}, ${j({ ligne_excel: l.position })});`);
    if (f.telephone_brut) ordres.push(`insert into alertes (type, consultant_id, details) values ('telephone_invalide', ${q(id)}, ${j({ ligne_excel: l.position, valeur: f.telephone_brut })});`);
  }

  console.log(JSON.stringify(stats));
  if (!appliquer) { console.log(`${ordres.length} ordres préparés (simulation, rien n'est écrit).`); return; }
  await sql(`begin;\n${ordres.join("\n")}\ncommit;`);
  console.log(`${ordres.length} ordres appliqués.`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
