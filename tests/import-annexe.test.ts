import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { importerAnnexe, rattacherColonnes, REGLAGE_COLONNES_AJOUTEES } from "@/lib/import/annexe";
import type { OngletLu } from "@/lib/import/excel";

/** Base simulée : requêtes chaînables (select/eq/in/order/range/maybeSingle, insert, update, upsert). */
function baseSimulee(initial: Record<string, Record<string, unknown>[]>) {
  const tables: Record<string, Record<string, unknown>[]> = {
    consultants: [], consultants_historique: [], alertes: [], tableau_onglets: [], tableau_lignes: [], reglages: [], ...initial,
  };
  let n = 0;
  const client = {
    from(table: string) {
      const filtres: ((r: Record<string, unknown>) => boolean)[] = [];
      let maj: Record<string, unknown> | null = null;
      const lignes = () => tables[table].filter((r) => filtres.every((f) => f(r)));
      const resultat = () => {
        if (maj) { for (const r of lignes()) Object.assign(r, maj); return { data: null, error: null }; }
        return { data: lignes(), error: null };
      };
      const q: Record<string, unknown> = {
        select: () => q,
        order: () => q,
        eq: (k: string, v: unknown) => { filtres.push((r) => r[k] === v); return q; },
        in: (k: string, v: unknown[]) => { filtres.push((r) => v.includes(r[k])); return q; },
        range: async (a: number, b: number) => ({ data: lignes().slice(a, b + 1), error: null }),
        maybeSingle: async () => ({ data: lignes()[0] ?? null, error: null }),
        update: (v: Record<string, unknown>) => { maj = v; return q; },
        upsert: async (v: Record<string, unknown>) => {
          const ex = tables[table].find((r) => r.cle === v.cle);
          if (ex) Object.assign(ex, v); else tables[table].push(v);
          return { error: null };
        },
        insert: (v: Record<string, unknown> | Record<string, unknown>[]) => {
          const nouvelles = (Array.isArray(v) ? v : [v]).map((x) => ({ id: `id${++n}`, ...x }));
          tables[table].push(...nouvelles);
          const res = { data: nouvelles, error: null };
          return Object.assign(Promise.resolve(res), { select: async () => res });
        },
        then: (ok: (r: unknown) => unknown) => Promise.resolve(resultat()).then(ok),
      };
      return q;
    },
  };
  return { client: client as unknown as SupabaseClient, tables };
}

const ENTETES_BASE = ["Prénom", "Nom", "Email", "Téléphone", "Disponibilité", "Commentaire RH"];

describe("rattachement des colonnes d'un fichier annexe", () => {
  it("même titre, même sens (« Tél » → « Téléphone ») ou absente", () => {
    const r = rattacherColonnes(["Prenom", "NOM", "Tél", "commentaire rh", "Permis"], ENTETES_BASE);
    expect(r).toEqual([
      { colonne: "Prenom", champ: "prenom", type: "champ", cible: "Prénom" },
      { colonne: "NOM", champ: "nom", type: "champ", cible: "Nom" },
      { colonne: "Tél", champ: "telephone", type: "champ", cible: "Téléphone" },
      { colonne: "commentaire rh", type: "colonne", cible: "Commentaire RH" },
      { colonne: "Permis", type: "nouvelle", cible: null },
    ]);
  });
});

describe("import d'un fichier annexe", () => {
  it("ajoute les nouveaux, complète les cases vides sans rien écraser, ajoute les colonnes choisies", async () => {
    const { client, tables } = baseSimulee({
      tableau_onglets: [{ id: "o1", principal: true, entetes: [...ENTETES_BASE] }],
      consultants: [
        // Dans le fichier de suivi (ligne reliée) : email connu, disponibilité déjà remplie.
        { id: "a", prenom: "Jean", nom: "Dupont", email: "jean@ex.fr", telephone_e164: null, disponibilite: "Immédiate", source: "import_excel", colonnes_tableau: {}, excel_maj_en_attente: null },
        // Hors Excel (reçu par email), retrouvé par téléphone.
        { id: "b", prenom: "Léa", nom: "Martin", email: null, telephone_e164: "+33612345678", disponibilite: null, source: "email", ajoute_excel_le: null, colonnes_tableau: {}, excel_maj_en_attente: null },
      ],
      tableau_lignes: [{ id: "l1", onglet_id: "o1", consultant_id: "a", valeurs: { Prénom: "Jean", Nom: "Dupont", Email: "jean@ex.fr", Disponibilité: "Immédiate" } }],
    });
    const onglet: OngletLu = {
      nom: "Feuil1",
      entetes: ["Prénom", "Nom", "Email", "Tél", "Disponibilité", "Commentaire RH", "Permis", "Inutile"],
      lignes: [
        ["Jean", "Dupont", "jean@ex.fr", "06 11 22 33 44", "Septembre", "Bon contact", "B", "x"],
        ["Léa", "Martin", null, "0612345678", "Octobre", null, "A", "y"],
        ["Paul", "Neuf", "paul@ex.fr", null, null, "Nouveau", "B", "z"],
      ],
      numeros: [2, 3, 4],
    };
    const colonnes = rattacherColonnes(onglet.entetes, ENTETES_BASE);
    const bilan = await importerAnnexe(client, onglet, colonnes, ["Permis"], "admin", "annexe.xlsx");

    expect(bilan).toMatchObject({ crees: 1, completees: 2, colonnesAjoutees: ["Permis"], erreurs: [] });
    // Colonne choisie ajoutée en fin de tableau et mémorisée pour l'Excel ; « Inutile » ignorée.
    expect(tables.tableau_onglets[0].entetes).toEqual([...ENTETES_BASE, "Permis"]);
    expect(tables.reglages.find((r) => r.cle === REGLAGE_COLONNES_AJOUTEES)!.valeur).toEqual(["Permis"]);

    // Jean : disponibilité gardée, téléphone complété, cases vides de sa ligne remplies et en attente pour l'Excel.
    const jean = tables.consultants.find((c) => c.id === "a")!;
    expect(jean.disponibilite).toBe("Immédiate");
    expect(jean.telephone_e164).toBe("+33611223344");
    expect(tables.tableau_lignes[0].valeurs).toMatchObject({ Disponibilité: "Immédiate", Téléphone: "06 11 22 33 44", "Commentaire RH": "Bon contact", Permis: "B" });
    expect((jean.excel_maj_en_attente as { cellules: Record<string, string> }).cellules).toEqual({ Téléphone: "06 11 22 33 44", "Commentaire RH": "Bon contact", Permis: "B" });

    // Léa (hors Excel) : disponibilité complétée, colonne libre gardée sur la fiche, rien en attente (ajoutée entière la nuit).
    const lea = tables.consultants.find((c) => c.id === "b")!;
    expect(lea.disponibilite).toBe("Octobre");
    expect(lea.colonnes_tableau).toEqual({ Permis: "A" });
    expect(lea.excel_maj_en_attente).toBeNull();

    // Paul : nouvelle fiche, origine « import_annexe », colonnes sans champ dédié gardées.
    const paul = tables.consultants.find((c) => c.nom === "Neuf")!;
    expect(paul).toMatchObject({ source: "import_annexe", email: "paul@ex.fr", colonnes_tableau: { "Commentaire RH": "Nouveau", Permis: "B" } });
    expect(tables.consultants).toHaveLength(3);
    expect(tables.consultants_historique).toHaveLength(2);
  });
});
