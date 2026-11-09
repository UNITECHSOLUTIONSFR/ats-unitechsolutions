/**
 * Données déjà importées : fusionne les onglets métier (copies de l'onglet principal) dans la colonne « Domaine »
 * de l'onglet principal, ajoute les lignes qui n'existaient que dans un onglet métier (avec leur fiche),
 * puis supprime les onglets métier devenus inutiles. Même règle que l'import (fusionnerOnglets).
 * Usage : NODE_USE_ENV_PROXY=1 npx tsx scripts/fusionner-onglets-existants.ts [--appliquer]
 */
import { COLONNE_DOMAINE, fusionnerOnglets, preparerImport, type Cellule, type OngletLu } from "../src/lib/import/excel";

const PROJET = "vobarkpycakqoivzlvck";
const appliquer = process.argv.includes("--appliquer");

async function sql<T = Record<string, unknown>>(requete: string): Promise<T[]> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJET}/database/query`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: requete }),
  });
  const texte = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status} : ${texte.slice(0, 300)}`);
  return JSON.parse(texte) as T[];
}
const q = (v: unknown) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const j = (v: unknown) => `${q(JSON.stringify(v))}::jsonb`;
const tableauTexte = (t: string[]) => q(`{${t.map((e) => `"${e.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`);

interface Onglet { id: string; nom: string; entetes: string[]; principal: boolean }
interface Ligne { id: string; onglet_id: string; position: number; valeurs: Record<string, string>; consultant_id: string | null }

async function main() {
  const onglets = await sql<Onglet>(`select id, nom, entetes, principal from tableau_onglets order by principal desc, position`);
  const lignes = await sql<Ligne>(`select id, onglet_id, position, valeurs, consultant_id from tableau_lignes order by position`);
  const [principal, ...autres] = onglets;
  if (!principal?.principal) throw new Error("Onglet principal introuvable.");
  const versOnglet = (o: Onglet): OngletLu => {
    const ls = lignes.filter((l) => l.onglet_id === o.id);
    return { nom: o.nom, entetes: o.entetes, numeros: ls.map((l) => l.position), lignes: ls.map((l) => o.entetes.map((e) => l.valeurs[e] ?? null)) };
  };
  const lignesPrincipal = lignes.filter((l) => l.onglet_id === principal.id);
  const { onglet: fusion, lignesAjoutees, lignesRetrouvees } = fusionnerOnglets([versOnglet(principal), ...autres.map(versOnglet)]);
  const iDomaine = fusion.entetes.indexOf(COLONNE_DOMAINE);
  const ordres: string[] = [`update tableau_onglets set entetes = ${tableauTexte(fusion.entetes)} where id = ${q(principal.id)};`];
  const emailsPris = new Set((await sql<{ email: string }>(`select email from consultants where email is not null`)).map((r) => r.email));

  // Lignes existantes : on ajoute seulement le domaine.
  lignesPrincipal.forEach((l, i) => {
    const d = fusion.lignes[i][iDomaine];
    if (d) ordres.push(`update tableau_lignes set valeurs = valeurs || ${j({ [COLONNE_DOMAINE]: d })} where id = ${q(l.id)};`);
  });

  // Lignes présentes seulement dans un onglet métier : ligne du tableau + fiche consultant.
  for (let i = lignesPrincipal.length; i < fusion.lignes.length; i++) {
    const cellules = fusion.lignes[i] as Cellule[];
    const valeurs: Record<string, string> = {};
    fusion.entetes.forEach((e, k) => { const v = cellules[k]; if (v !== null && v !== undefined && String(v).trim()) valeurs[e] = String(v); });
    const { fiches: [f] } = preparerImport(fusion.entetes, [cellules]);
    const ligneId = crypto.randomUUID();
    let consultantId: string | null = null;
    if (f) {
      consultantId = crypto.randomUUID();
      const email = f.email && !emailsPris.has(f.email) ? f.email : null;
      if (email) emailsPris.add(email);
      ordres.push(`insert into consultants (id, prenom, nom, trigramme, email, telephone_e164, telephone_brut, intitule_poste, disponibilite, localisation, notes, experience, tjm_salaire, linkedin, cv_lien, email_2, commentaire_email, source, donnees_excel)
        values (${q(consultantId)}, ${q(f.prenom || "—")}, ${q(f.nom)}, ${q(f.trigramme)}, ${q(email)}, ${q(f.telephone_e164)}, ${q(f.telephone_brut)}, ${q(f.intitule_poste)}, ${q(f.disponibilite)}, ${q(f.localisation)}, ${q(f.notes)}, ${q(f.experience)}, ${q(f.tjm_salaire)}, ${q(f.linkedin)}, ${q(f.cv_lien)}, ${q(f.email_2)}, ${q(f.commentaire_email)}, 'import_excel', ${j([{ ligne: fusion.numeros[i], valeurs }])});`);
      if (!f.nom) ordres.push(`insert into alertes (type, consultant_id, details) values ('nom_manquant', ${q(consultantId)}, ${j({ domaine: valeurs[COLONNE_DOMAINE] })});`);
      if (f.telephone_brut) ordres.push(`insert into alertes (type, consultant_id, details) values ('telephone_invalide', ${q(consultantId)}, ${j({ valeur: f.telephone_brut })});`);
    }
    ordres.push(`insert into tableau_lignes (id, onglet_id, position, valeurs, consultant_id) values (${q(ligneId)}, ${q(principal.id)}, ${fusion.numeros[i]}, ${j(valeurs)}, ${q(consultantId)});`);
  }

  // Les onglets métier ne servent plus : supprimés (leurs lignes sont toutes dans l'onglet principal).
  if (autres.length) ordres.push(`delete from tableau_onglets where id in (${autres.map((o) => q(o.id)).join(", ")});`);

  console.log(JSON.stringify({ ongletsMetier: autres.map((o) => o.nom), lignesRetrouvees, lignesAjoutees, lignesPrincipalAvant: lignesPrincipal.length, lignesPrincipalApres: fusion.lignes.length }));
  if (!appliquer) { console.log(`${ordres.length} ordres préparés (simulation, rien n'est écrit).`); return; }
  await sql(`begin;\n${ordres.join("\n")}\ncommit;`);
  console.log(`${ordres.length} ordres appliqués.`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
