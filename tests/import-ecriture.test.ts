import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ecrireFiches } from "@/lib/import/ecriture";
import type { FicheImport } from "@/lib/import/excel";

/** Base simulée en mémoire : juste ce qu'utilise ecrireFiches. */
function baseSimulee(initial: Record<string, Record<string, unknown>[]>) {
  const tables: Record<string, Record<string, unknown>[]> = { consultants: [], consultants_historique: [], alertes: [], ...initial };
  let n = 0;
  const client = {
    from(table: string) {
      return {
        select: () => ({ range: async (a: number, b: number) => ({ data: tables[table].slice(a, b + 1), error: null }) }),
        update: (v: Record<string, unknown>) => ({
          eq: async (_k: string, id: string) => {
            Object.assign(tables[table].find((r) => r.id === id)!, v);
            return { error: null };
          },
        }),
        insert: (v: Record<string, unknown> | Record<string, unknown>[]) => {
          const lignes = (Array.isArray(v) ? v : [v]).map((x) => ({ id: `id${++n}`, ...x }));
          tables[table].push(...lignes);
          const res = { data: lignes, error: null };
          return Object.assign(Promise.resolve(res), { select: async () => res });
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, tables };
}

const fiche = (f: Partial<FicheImport>): FicheImport => ({
  ligne: 2, prenom: "Jean", nom: "Dupont", trigramme: "JDU", email: null, telephone_e164: null, telephone_brut: null,
  intitule_poste: null, disponibilite: null, disponible_le: null, localisation: null, notes: null, statut_texte: null, date_maj: null,
  experience: null, tjm_salaire: null, linkedin: null, cv_lien: null, email_2: null, commentaire_email: null, donnees_excel: [{ ligne: 2, valeurs: { Nom: "Dupont" } }], ...f,
});

describe("écriture de l'import", () => {
  it("crée, complète un doublon sans écraser, et signale les cas à vérifier", async () => {
    const { client, tables } = baseSimulee({
      consultants: [
        { id: "a", prenom: "Jean", nom: "Dupont", email: "jean@ex.fr", telephone_e164: null, intitule_poste: "Dev Java", disponibilite: null },
        { id: "b", prenom: "Éloïse", nom: "Gérard", email: "e@ex.fr", telephone_e164: "+33600000000" },
      ],
    });
    const bilan = await ecrireFiches(client, [
      fiche({ ligne: 2, email: "jean@ex.fr", telephone_e164: "+33612345678", intitule_poste: "Autre poste", disponibilite: "Immédiate" }),
      fiche({ ligne: 3, prenom: "Eloise", nom: "GERARD", trigramme: "EGE", email: "autre@ex.fr" }),
      fiche({ ligne: 4, prenom: "John", nom: "Smith", trigramme: "JSM", telephone_brut: "+44 20 7946 0958", statut_texte: "En mission" }),
    ], "admin");

    expect(bilan).toMatchObject({ crees: 2, misAJour: 1, alertes: 2, erreurs: [] });
    const jean = tables.consultants.find((c) => c.id === "a")!;
    expect(jean.intitule_poste).toBe("Dev Java"); // valeur existante conservée
    expect(jean.telephone_e164).toBe("+33612345678"); // champ vide complété
    expect(jean.disponibilite).toBe("Immédiate");
    expect(tables.consultants_historique).toHaveLength(1);
    expect(tables.alertes.map((a) => a.type).sort()).toEqual(["doublon_possible", "telephone_invalide"]);
    expect(tables.consultants.find((c) => c.nom === "Smith")!.statut).toBe("en_mission");
    expect(tables.consultants.every((c) => !("_ligne" in c))).toBe(true);
  });

  it("réimporter le même fichier ne crée aucun doublon", async () => {
    const { client, tables } = baseSimulee({});
    const fiches = [fiche({ email: "jean@ex.fr", telephone_e164: "+33612345678" })];
    await ecrireFiches(client, fiches, "admin");
    const bilan = await ecrireFiches(client, fiches, "admin");
    expect(bilan.crees).toBe(0);
    expect(tables.consultants).toHaveLength(1);
  });

  it("réimporter une personne sans email ni téléphone ne crée pas de doublon", async () => {
    const { client, tables } = baseSimulee({});
    const fiches = [fiche({ ligne: 7, donnees_excel: [{ ligne: 7, valeurs: { Nom: "Sans", "Prénoms": "Contact" } }] })];
    await ecrireFiches(client, fiches, "admin");
    const bilan = await ecrireFiches(client, fiches, "admin");
    expect(bilan.crees).toBe(0);
    expect(tables.consultants).toHaveLength(1);
  });

  it("synchronisation : l'Excel fait foi et remplace les valeurs de la fiche", async () => {
    const { client, tables } = baseSimulee({
      consultants: [{ id: "a", prenom: "Jean", nom: "Dupont", email: "jean@ex.fr", telephone_e164: "+33600000000", disponibilite: "Mars", statut: "candidat" }],
    });
    await ecrireFiches(client, [fiche({ email: "jean@ex.fr", telephone_e164: "+33611111111", disponibilite: "Immédiate", statut_texte: "En mission" })], null, { excelFaitFoi: true });
    expect(tables.consultants[0]).toMatchObject({ telephone_e164: "+33611111111", disponibilite: "Immédiate", statut: "en_mission" });
    expect(tables.consultants_historique[0].source).toBe("synchro_excel");
  });

  it("une fiche de l'ATS renvoyée dans l'Excel est retrouvée à la relecture, même sans email ni téléphone", async () => {
    const { client, tables } = baseSimulee({
      consultants: [{ id: "a", prenom: "Ana", nom: "Roux", trigramme: "ARO", email: null, telephone_e164: null, ajoute_excel_le: "2026-11-10", donnees_excel: [] }],
    });
    const bilan = await ecrireFiches(client, [fiche({ prenom: "Ana", nom: "Roux", trigramme: "ARO", ligne: 4034, donnees_excel: [{ ligne: 4034, valeurs: { Nom: "Roux" } }] })], null, { excelFaitFoi: true });
    expect(bilan.crees).toBe(0);
    expect(tables.consultants).toHaveLength(1);
  });

  it("synchronisation : une ligne Excel identique ne modifie rien, ni la date de disponibilité ni l'historique", async () => {
    const { client, tables } = baseSimulee({
      consultants: [{ id: "a", prenom: "Jean", nom: "Dupont", trigramme: "JDU", email: "jean@ex.fr", telephone_e164: null, disponibilite: "Immédiate", disponibilite_maj_le: "2026-01-01T00:00:00Z", statut: "candidat" }],
    });
    const bilan = await ecrireFiches(client, [fiche({ email: "jean@ex.fr", disponibilite: "Immédiate" })], null, { excelFaitFoi: true });
    expect(tables.consultants[0].disponibilite_maj_le).toBe("2026-01-01T00:00:00Z");
    expect(tables.consultants_historique).toHaveLength(0);
    expect(bilan.misAJour).toBe(0);
  });

  it("synchronisation : une ligne sans email ni téléphone dont une cellule a changé n'est pas recréée", async () => {
    const { client, tables } = baseSimulee({
      consultants: [{ id: "a", prenom: "Jean", nom: "Dupont", trigramme: "JDU", email: null, telephone_e164: null, donnees_excel: [{ ligne: 9, valeurs: { Nom: "Dupont" } }] }],
    });
    const bilan = await ecrireFiches(client, [fiche({ ligne: 9, donnees_excel: [{ ligne: 9, valeurs: { Nom: "Dupont", Domaine: "Dev", Notes: "rappeler" } }] })], null, { excelFaitFoi: true });
    expect(bilan.crees).toBe(0);
    expect(tables.consultants).toHaveLength(1);
  });

  it("synchronisation : une ligne déplacée dans l'Excel (lignes supprimées au-dessus) n'est pas recréée", async () => {
    const { client, tables } = baseSimulee({
      consultants: [{ id: "a", prenom: "STOP 21/08", nom: "", trigramme: "", source: "import_excel", email: null, telephone_e164: null, donnees_excel: [{ ligne: 4037, valeurs: { "Prénoms": "STOP 21/08" } }] }],
    });
    const bilan = await ecrireFiches(client, [fiche({ prenom: "STOP 21/08", nom: "", ligne: 4014, donnees_excel: [{ ligne: 4014, valeurs: { "Prénoms": "STOP 21/08", Domaine: "Dev" } }] })], null, { excelFaitFoi: true });
    expect(bilan.crees).toBe(0);
    expect(tables.consultants).toHaveLength(1);
  });
});
