/**
 * Tests du schéma et des règles d'accès (Row Level Security) sur une base Postgres temporaire.
 * Lancement : npm run test:base (démarre la base locale si besoin).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

const racine = path.resolve(__dirname, "..");
const urlServeur = execSync(path.join(racine, "scripts/db-locale.sh")).toString().trim();
const nomBase = `ats_test_${Date.now()}`;
let db: Client;

const ADMIN = "00000000-0000-0000-0000-00000000000a";
const RECRUTEUR = "00000000-0000-0000-0000-00000000000b";
const INACTIF = "00000000-0000-0000-0000-00000000000c";
const INCONNU = "00000000-0000-0000-0000-00000000000d";

/** Exécute une requête en se faisant passer pour un utilisateur connecté (ou un visiteur). */
async function commeUtilisateur<T = Record<string, unknown>>(uid: string | null, sql: string, params: unknown[] = []) {
  await db.query("begin");
  try {
    await db.query(`set local role ${uid ? "authenticated" : "anon"}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [uid ?? ""]);
    const r = await db.query(sql, params);
    await db.query("commit");
    return r.rows as T[];
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}

beforeAll(async () => {
  const admin = new Client({ connectionString: urlServeur });
  await admin.connect();
  await admin.query(`create database ${nomBase}`);
  await admin.end();
  db = new Client({ connectionString: urlServeur.replace(/\/postgres$/, `/${nomBase}`) });
  await db.connect();
  await db.query(readFileSync(path.join(racine, "tests/sql/supabase_simule.sql"), "utf8"));
  const dossier = path.join(racine, "supabase/migrations");
  for (const f of readdirSync(dossier).sort()) await db.query(readFileSync(path.join(dossier, f), "utf8"));
  await db.query(`insert into auth.users (id, email) values ($1,'admin@u.fr'),($2,'rec@u.fr'),($3,'parti@u.fr'),($4,'inconnu@u.fr')`,
    [ADMIN, RECRUTEUR, INACTIF, INCONNU]);
  await db.query(`insert into utilisateurs (id, email, role, actif) values
    ($1,'admin@u.fr','admin',true),($2,'rec@u.fr','recruteur',true),($3,'parti@u.fr','recruteur',false)`,
    [ADMIN, RECRUTEUR, INACTIF]);
});

afterAll(async () => {
  await db?.end();
  const admin = new Client({ connectionString: urlServeur });
  await admin.connect();
  await admin.query(`drop database if exists ${nomBase} with (force)`);
  await admin.end();
});

describe("schéma", () => {
  it("la RLS est activée sur toutes les tables, sans exception", async () => {
    const r = await db.query(`select tablename from pg_tables where schemaname='public' and not rowsecurity`);
    expect(r.rows).toEqual([]);
    const n = await db.query(`select count(*)::int as n from pg_tables where schemaname='public'`);
    expect(n.rows[0].n).toBeGreaterThanOrEqual(17);
  });

  it("chaque table a created_at et updated_at", async () => {
    const r = await db.query(`
      select t.tablename from pg_tables t where t.schemaname='public' and (
        not exists (select 1 from information_schema.columns c where c.table_name=t.tablename and c.column_name='created_at') or
        not exists (select 1 from information_schema.columns c where c.table_name=t.tablename and c.column_name='updated_at'))`);
    expect(r.rows).toEqual([]);
  });

  it("le référentiel de compétences est chargé, avec synonymes", async () => {
    const r = await db.query(`select nom_canonique from competences where 'reactjs' = any(synonymes)`);
    expect(r.rows[0].nom_canonique).toBe("React");
  });

  it("deux consultants peuvent avoir le même trigramme, pas le même email", async () => {
    await db.query(`insert into consultants (prenom, nom, trigramme, email) values ('Jean','Dupont','JDU','j1@x.fr'),('Julie','Durand','JDU','j2@x.fr')`);
    await expect(db.query(`insert into consultants (prenom, nom, trigramme, email) values ('X','Y','XY','j1@x.fr')`)).rejects.toThrow();
  });
});

describe("règles d'accès", () => {
  it("un visiteur non connecté n'a accès à rien", async () => {
    await expect(commeUtilisateur(null, "select * from consultants")).rejects.toThrow(/permission denied/);
  });

  it("un compte non invité ne voit rien et ne peut rien créer", async () => {
    expect(await commeUtilisateur(INCONNU, "select * from consultants")).toEqual([]);
    await expect(commeUtilisateur(INCONNU, `insert into consultants (prenom, nom, trigramme) values ('A','B','ABB')`)).rejects.toThrow();
  });

  it("un utilisateur désactivé ne voit plus rien (retrait d'accès en un clic)", async () => {
    expect(await commeUtilisateur(INACTIF, "select * from consultants")).toEqual([]);
  });

  it("un recruteur consulte, crée et modifie, mais ne supprime pas", async () => {
    const [c] = await commeUtilisateur<{ id: string }>(RECRUTEUR,
      `insert into consultants (prenom, nom, trigramme) values ('Paul','Martin','PMA') returning id`);
    await commeUtilisateur(RECRUTEUR, `update consultants set notes='appelé' where id=$1`, [c.id]);
    const lus = await commeUtilisateur<{ notes: string }>(RECRUTEUR, `select notes from consultants where id=$1`, [c.id]);
    expect(lus[0].notes).toBe("appelé");
    const supprimes = await commeUtilisateur(RECRUTEUR, `delete from consultants where id=$1 returning id`, [c.id]);
    expect(supprimes).toEqual([]);
  });

  it("un recruteur ne voit pas les coûts IA, ne change pas les réglages, ne gère pas les utilisateurs", async () => {
    await db.query(`insert into ai_usage (usage, modele, cout_estime_usd) values ('fiche_cv','claude-haiku-5-5',0.001)`);
    expect(await commeUtilisateur(RECRUTEUR, "select * from ai_usage")).toEqual([]);
    expect(await commeUtilisateur(ADMIN, "select * from ai_usage")).toHaveLength(1);
    expect(await commeUtilisateur(RECRUTEUR, `update reglages set valeur='99' where cle='plafond_ia_mensuel_usd' returning cle`)).toEqual([]);
    await expect(commeUtilisateur(RECRUTEUR, `insert into utilisateurs (id, email) values ($1,'inconnu@u.fr')`, [INCONNU])).rejects.toThrow();
    expect(await commeUtilisateur(RECRUTEUR, "select email from utilisateurs")).toEqual([{ email: "rec@u.fr" }]);
  });

  it("un administrateur supprime une fiche, et la suppression est tracée", async () => {
    const [c] = await commeUtilisateur<{ id: string }>(ADMIN,
      `insert into consultants (prenom, nom, trigramme) values ('Léa','Petit','LPE') returning id`);
    expect(await commeUtilisateur(ADMIN, `delete from consultants where id=$1 returning id`, [c.id])).toHaveLength(1);
    const j = await db.query(`select utilisateur_id, details from journal_acces where action='suppression' and consultant_id=$1`, [c.id]);
    expect(j.rows[0].utilisateur_id).toBe(ADMIN);
    expect(j.rows[0].details.trigramme).toBe("LPE");
  });

  it("les échéances des secrets sont réservées aux administrateurs ; le planificateur ne se déclenche pas depuis l'application", async () => {
    expect(await commeUtilisateur(RECRUTEUR, "select * from echeances_secrets")).toEqual([]);
    expect((await commeUtilisateur(ADMIN, "select * from echeances_secrets")).length).toBeGreaterThan(0);
    expect(await commeUtilisateur(RECRUTEUR, `update echeances_secrets set expire_le='2030-01-01' returning id`)).toEqual([]);
    await expect(commeUtilisateur(ADMIN, "select lancer_tache_planifiee('emails')")).rejects.toThrow(/permission denied/);
    await expect(commeUtilisateur(RECRUTEUR, "select lancer_tache_planifiee('excel')")).rejects.toThrow(/permission denied/);
  });

  it("textes des consultants : jamais lus directement, seulement par la fonction de matching", async () => {
    await expect(commeUtilisateur(RECRUTEUR, "select * from textes_consultants")).rejects.toThrow(/permission denied/);
    await expect(commeUtilisateur(null, "select * from consultants_par_motifs(array['java'])")).rejects.toThrow(/permission denied/);
    expect(await commeUtilisateur(INACTIF, "select * from consultants_par_motifs(array['java'])")).toEqual([]);
    await commeUtilisateur(RECRUTEUR, "select * from consultants_par_motifs(array['java'])");
    await expect(commeUtilisateur(RECRUTEUR, "select * from competences_textes")).rejects.toThrow(/permission denied/);
    await expect(commeUtilisateur(null, "select * from consultants_par_competences('{}', '{}')")).rejects.toThrow(/permission denied/);
    expect(await commeUtilisateur(INACTIF, "select * from consultants_par_competences('{}', '{}')")).toEqual([]);
    await expect(commeUtilisateur(RECRUTEUR, "select preparer_competences_textes()")).rejects.toThrow(/permission denied/);
  });

  it("recherche : un recruteur lit les candidats et les extraits ; un visiteur n'y a pas accès", async () => {
    await expect(commeUtilisateur(null, "select * from candidats_recherche('{}', '{}', '{}')")).rejects.toThrow(/permission denied/);
    await expect(commeUtilisateur(null, "select * from rechercher_dans_cv_extraits('java')")).rejects.toThrow(/permission denied/);
    await commeUtilisateur(RECRUTEUR, "select * from candidats_recherche('{}', array['%dev%'], '{}')");
    await commeUtilisateur(RECRUTEUR, "select * from rechercher_dans_cv_extraits('java')");
  });

  it("le journal d'accès est réservé aux administrateurs", async () => {
    await commeUtilisateur(RECRUTEUR, `insert into journal_acces (utilisateur_id, action) values ($1,'consultation')`, [RECRUTEUR]);
    await expect(commeUtilisateur(RECRUTEUR, `insert into journal_acces (utilisateur_id, action) values ($1,'export')`, [ADMIN])).rejects.toThrow();
    expect(await commeUtilisateur(RECRUTEUR, "select * from journal_acces")).toEqual([]);
  });

  it("chaque changement de statut d'une proposition est historisé", async () => {
    const [m] = await commeUtilisateur<{ id: string }>(RECRUTEUR,
      `insert into missions (intitule, texte_besoin) values ('Dev React','Besoin…') returning id`);
    const [c] = await commeUtilisateur<{ id: string }>(RECRUTEUR,
      `insert into consultants (prenom, nom, trigramme) values ('Tom','Roux','TRO') returning id`);
    const [p] = await commeUtilisateur<{ id: string }>(RECRUTEUR,
      `insert into propositions (mission_id, consultant_id, score) values ($1,$2,82) returning id`, [m.id, c.id]);
    await commeUtilisateur(RECRUTEUR, `update propositions set statut='appele' where id=$1`, [p.id]);
    await commeUtilisateur(RECRUTEUR, `update propositions set statut='envoye_client' where id=$1`, [p.id]);
    const h = await commeUtilisateur<{ nouveau_statut: string }>(RECRUTEUR,
      `select nouveau_statut from propositions_historique where proposition_id=$1 order by created_at, nouveau_statut`, [p.id]);
    expect(h.map((x) => x.nouveau_statut).sort()).toEqual(["appele", "envoye_client", "propose"]);
  });
});

describe("fonctions de matching", () => {
  it("candidats d'une mission : compétence commune requise, inactifs exclus, RLS appliquée", async () => {
    const ids = await db.query(`select id, nom_canonique from competences where nom_canonique in ('Java','React','Python')`);
    const comp = Object.fromEntries(ids.rows.map((r) => [r.nom_canonique, r.id]));
    const ins = await db.query(`insert into consultants (prenom, nom, trigramme, statut, telephone_e164) values
      ('Ana','Java','AJA','consultant','+33600000001'),('Bob','React','BRE','candidat',null),('Cid','Inactif','CIN','inactif',null)
      returning id, nom`);
    const c = Object.fromEntries(ins.rows.map((r) => [r.nom, r.id]));
    await db.query(`insert into consultant_competences (consultant_id, competence_id, annees) values ($1,$2,6),($3,$4,2),($5,$2,9)`,
      [c.Java, comp.Java, c.React, comp.React, c.Inactif]);
    await db.query(`insert into documents (consultant_id, type, sharepoint_drive_id, sharepoint_item_id, nom_fichier, url_web)
      values ($1,'pdf_anonyme','d','i1','Unitech Solution, AJA, Dev.pdf','https://sp/aja.pdf')`, [c.Java]);
    const m = await db.query(`insert into missions (intitule, texte_besoin) values ('Dev Java','…') returning id`);
    await db.query(`insert into mission_competences (mission_id, competence_id, obligatoire, importance) values ($1,$2,true,3),($1,$3,false,1)`,
      [m.rows[0].id, comp.Java, comp.Python]);

    const r = await commeUtilisateur<Record<string, unknown>>(RECRUTEUR, "select * from candidats_mission($1)", [m.rows[0].id]);
    expect(r.map((x) => x.nom)).toEqual(["Java"]);
    expect(r[0].pdf_anonyme_url).toBe("https://sp/aja.pdf");
    expect(r[0].competences).toEqual([{ competence_id: comp.Java, annees: 6 }]);
    expect(await commeUtilisateur(INCONNU, "select * from candidats_mission($1)", [m.rows[0].id])).toEqual([]);
    await expect(commeUtilisateur(null, "select * from candidats_mission($1)", [m.rows[0].id])).rejects.toThrow();
  });

  it("recherche de consultants par nom, trigramme ou poste", async () => {
    await db.query(`insert into consultants (prenom, nom, trigramme, intitule_poste) values ('Nina','Rechercheuse','NRE','Data engineer')`);
    for (const q of ["rechercheuse", "NRE", "data engineer"]) {
      const r = await commeUtilisateur<{ nom: string }>(RECRUTEUR, "select nom from rechercher_consultants($1)", [q]);
      expect(r.map((x) => x.nom)).toContain("Rechercheuse");
    }
  });
});

describe("tableau de suivi", () => {
  it("un recruteur lit et modifie les lignes (une ou plusieurs à la fois), sans pouvoir supprimer ni changer les onglets", async () => {
    const [o] = await commeUtilisateur<{ id: string }>(ADMIN,
      `insert into tableau_onglets (nom, position, entetes, principal) values ('Suivi', 0, '{Nom,Prénoms,Statut}', true) returning id`);
    const lignes = await commeUtilisateur<{ id: string }>(ADMIN,
      `insert into tableau_lignes (onglet_id, position, valeurs) values
        ($1, 2, '{"Nom":"Dupont","Statut":"Dispo"}'), ($1, 3, '{"Nom":"Martin"}') returning id`, [o.id]);
    const ids = lignes.map((l) => l.id);

    const [{ n }] = await commeUtilisateur<{ n: number }>(RECRUTEUR, `select tableau_modifier($1::uuid[], 'Statut', ' En mission ') as n`, [ids]);
    expect(n).toBe(2);
    const lus = await commeUtilisateur<{ valeurs: Record<string, string> }>(RECRUTEUR, `select valeurs from tableau_lignes where onglet_id=$1 order by position`, [o.id]);
    expect(lus.map((l) => l.valeurs.Statut)).toEqual(["En mission", "En mission"]);

    await commeUtilisateur(RECRUTEUR, `select tableau_modifier($1::uuid[], 'Statut', '')`, [[ids[0]]]);
    const [vide] = await commeUtilisateur<{ valeurs: Record<string, string> }>(RECRUTEUR, `select valeurs from tableau_lignes where id=$1`, [ids[0]]);
    expect(vide.valeurs).toEqual({ Nom: "Dupont" });

    expect(await commeUtilisateur(RECRUTEUR, `delete from tableau_lignes where id=$1 returning id`, [ids[0]])).toEqual([]);
    expect(await commeUtilisateur(RECRUTEUR, `update tableau_onglets set nom='X' where id=$1 returning id`, [o.id])).toEqual([]);
    await expect(commeUtilisateur(RECRUTEUR, `insert into tableau_onglets (nom, position) values ('Pirate', 9)`)).rejects.toThrow();
    expect(await commeUtilisateur(INCONNU, `select * from tableau_lignes`)).toEqual([]);
    await expect(commeUtilisateur(null, `select * from tableau_lignes`)).rejects.toThrow(/permission denied/);
  });

  it("l'effacement d'un consultant retire aussi sa ligne du tableau", async () => {
    const [c] = await commeUtilisateur<{ id: string }>(ADMIN, `insert into consultants (prenom, nom, trigramme) values ('Zoé','Blanc','ZBL') returning id`);
    const [o] = await commeUtilisateur<{ id: string }>(ADMIN, `insert into tableau_onglets (nom, position) values ('Effacement', 5) returning id`);
    await commeUtilisateur(ADMIN, `insert into tableau_lignes (onglet_id, position, consultant_id) values ($1, 2, $2)`, [o.id, c.id]);
    await commeUtilisateur(ADMIN, `delete from consultants where id=$1`, [c.id]);
    expect(await commeUtilisateur(ADMIN, `select * from tableau_lignes where onglet_id=$1`, [o.id])).toEqual([]);
  });

  it("effacement RGPD : un administrateur supprime fiche, documents et emails ; un recruteur ne peut pas", async () => {
    const [c] = await commeUtilisateur<{ id: string }>(ADMIN, `insert into consultants (prenom, nom, trigramme) values ('Effa','Cement','ECE') returning id`);
    await db.query(`insert into documents (consultant_id, type, sharepoint_drive_id, sharepoint_item_id, nom_fichier, texte_extrait) values ($1,'word_nominatif','d','rgpd1','cv.docx','texte')`, [c.id]);
    await db.query(`insert into emails_entrants (message_id, expediteur, consultant_id) values ('m-rgpd','x@y.fr',$1)`, [c.id]);
    expect(await commeUtilisateur(RECRUTEUR, `delete from emails_entrants where consultant_id=$1 returning id`, [c.id])).toEqual([]);
    expect(await commeUtilisateur(ADMIN, `delete from documents where consultant_id=$1 returning id`, [c.id])).toHaveLength(1);
    expect(await commeUtilisateur(ADMIN, `delete from emails_entrants where consultant_id=$1 returning id`, [c.id])).toHaveLength(1);
    expect(await commeUtilisateur(ADMIN, `delete from consultants where id=$1 returning id`, [c.id])).toHaveLength(1);
  });
  it("responsable de mission : seul un administrateur assigne ; tout invité voit la liste des responsables possibles", async () => {
    const [m] = await commeUtilisateur<{ id: string }>(RECRUTEUR, "insert into missions (intitule, texte_besoin) values ('M resp', 'besoin') returning id");
    await expect(commeUtilisateur(RECRUTEUR, "update missions set responsable_id = $1 where id = $2", [RECRUTEUR, m.id])).rejects.toThrow(/administrateur/);
    await commeUtilisateur(RECRUTEUR, "update missions set statut = 'pourvue' where id = $1", [m.id]); // le reste reste modifiable
    await commeUtilisateur(ADMIN, "update missions set responsable_id = $1 where id = $2", [RECRUTEUR, m.id]);
    const [r] = await commeUtilisateur<{ responsable_id: string }>(RECRUTEUR, "select responsable_id from missions where id = $1", [m.id]);
    expect(r.responsable_id).toBe(RECRUTEUR);
    const liste = await commeUtilisateur<{ id: string }>(RECRUTEUR, "select id from responsables_possibles()");
    expect(liste.map((x) => x.id).sort()).toEqual([ADMIN, RECRUTEUR].sort()); // les comptes désactivés n'y sont pas
    expect(await commeUtilisateur(INCONNU, "select id from responsables_possibles()")).toEqual([]);
  });
  it("relance des disponibilités : préparation et envoi réservés aux administrateurs, suivi lisible par tous", async () => {
    await expect(commeUtilisateur(RECRUTEUR, "insert into campagnes_relance (objet, corps) values ('o', 'c')")).rejects.toThrow();
    const [c] = await commeUtilisateur<{ id: string }>(ADMIN, "insert into campagnes_relance (objet, corps) values ('o', 'c') returning id");
    const [f] = await commeUtilisateur<{ id: string }>(ADMIN, "insert into consultants (prenom, nom, trigramme, email) values ('R', 'Elance', 'REL', 'r@x.fr') returning id");
    await commeUtilisateur(ADMIN, "insert into envois_relance (campagne_id, consultant_id, email) values ($1, $2, 'r@x.fr')", [c.id, f.id]);
    expect(await commeUtilisateur(RECRUTEUR, "select statut from envois_relance where campagne_id = $1", [c.id])).toEqual([{ statut: "a_envoyer" }]);
    await expect(commeUtilisateur(RECRUTEUR, "update envois_relance set statut = 'envoye' where campagne_id = $1 returning id", [c.id])).resolves.toEqual([]);
    expect(await commeUtilisateur(INCONNU, "select id from envois_relance")).toEqual([]);
  });
  it("fusion de deux fiches : réservée aux administrateurs, rien n'est perdu", async () => {
    const [a] = await commeUtilisateur<{ id: string }>(ADMIN, "insert into consultants (prenom, nom, trigramme, email) values ('Ana', 'Roux', 'ARO', 'ana1@x.fr') returning id");
    const [b] = await commeUtilisateur<{ id: string }>(ADMIN, "insert into consultants (prenom, nom, trigramme, email, telephone_e164) values ('Ana', 'ROUX', 'ARO', 'ana2@x.fr', '+33611111111') returning id");
    await commeUtilisateur(ADMIN, "insert into alertes (type, consultant_id) values ('doublon_possible', $1)", [b.id]);
    await expect(commeUtilisateur(RECRUTEUR, "select fusionner_consultants($1, $2, '{}')", [a.id, b.id])).rejects.toThrow(/administrateurs/);
    await commeUtilisateur(ADMIN, "select fusionner_consultants($1, $2, $3)", [a.id, b.id, JSON.stringify({ email: "ana2@x.fr", telephone_e164: "+33611111111" })]);
    const [f] = await commeUtilisateur<{ email: string; telephone_e164: string }>(ADMIN, "select email, telephone_e164 from consultants where id = $1", [a.id]);
    expect(f).toEqual({ email: "ana2@x.fr", telephone_e164: "+33611111111" });
    expect(await commeUtilisateur(ADMIN, "select id from consultants where id = $1", [b.id])).toEqual([]);
    expect(await commeUtilisateur(ADMIN, "select statut from alertes where consultant_id = $1 and type = 'doublon_possible'", [a.id])).toEqual([]);
    const [h] = await commeUtilisateur<{ n: string }>(ADMIN, "select count(*) n from consultants_historique where consultant_id = $1 and source = 'fusion'", [a.id]);
    expect(Number(h.n)).toBe(1);
  });
  it("notes rapides : tout invité ajoute et lit ; on ne retire que ses notes (un admin retire tout)", async () => {
    const [f] = await commeUtilisateur<{ id: string }>(ADMIN, "insert into consultants (prenom, nom, trigramme) values ('N', 'Ote', 'NOT') returning id");
    await commeUtilisateur(RECRUTEUR, "insert into notes_consultant (consultant_id, texte) values ($1, 'appelé, dispo mars')", [f.id]);
    await expect(commeUtilisateur(RECRUTEUR, "insert into notes_consultant (consultant_id, texte, auteur) values ($1, 'x', $2)", [f.id, ADMIN])).rejects.toThrow();
    const [n] = await commeUtilisateur<{ id: string; texte: string }>(ADMIN, "select id, texte from notes_consultant where consultant_id = $1", [f.id]);
    expect(n.texte).toBe("appelé, dispo mars");
    expect(await commeUtilisateur(INACTIF, "select id from notes_consultant")).toEqual([]);
    await commeUtilisateur(ADMIN, "delete from notes_consultant where id = $1", [n.id]);
    expect(await commeUtilisateur(ADMIN, "select id from notes_consultant where consultant_id = $1", [f.id])).toEqual([]);
  });
});
