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
  intitule_poste: null, disponibilite: null, disponible_le: null, localisation: null, notes: null, statut_texte: null, date_maj: null, ...f,
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
});
