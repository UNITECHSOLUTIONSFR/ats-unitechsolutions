import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));
const { ecrireTableau } = await import("@/lib/tableau/ecriture");

type Ligne = Record<string, unknown>;
/** Base simulée en mémoire : juste les appels utilisés par ecrireTableau. */
function baseSimulee(initial: Record<string, Ligne[]>) {
  const tables: Record<string, Ligne[]> = { consultants: [], tableau_onglets: [], tableau_lignes: [], ...initial };
  let n = 0;
  const appels = { insertions: 0, misesAJour: 0, suppressions: 0 };
  const requete = (table: string) => {
    const filtres: ((r: Ligne) => boolean)[] = [];
    const lignes = () => tables[table].filter((r) => filtres.every((f) => f(r)));
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => { filtres.push((r) => r[k] === v); return q; },
      in: (k: string, v: unknown[]) => { filtres.push((r) => v.includes(r[k])); return q; },
      order: () => q,
      range: async (a: number, b: number) => ({ data: lignes().slice(a, b + 1), error: null }),
      then: (ok: (r: { data: Ligne[]; error: null }) => unknown) => Promise.resolve({ data: lignes(), error: null }).then(ok),
    };
    return {
      ...q,
      update: (v: Ligne) => ({ eq: async (k: string, id: unknown) => { appels.misesAJour++; Object.assign(tables[table].find((r) => r[k] === id)!, v); return { error: null }; } }),
      insert: (v: Ligne | Ligne[]) => {
        const nouvelles = (Array.isArray(v) ? v : [v]).map((x) => ({ id: `id${++n}`, ...x }));
        appels.insertions += nouvelles.length;
        tables[table].push(...nouvelles);
        const res = { data: nouvelles, error: null };
        return Object.assign(Promise.resolve(res), { select: () => ({ single: async () => ({ data: nouvelles[0], error: null }) }) });
      },
      upsert: async (v: Ligne[]) => { for (const x of v) { appels.misesAJour++; Object.assign(tables[table].find((r) => r.id === x.id)!, x); } return { error: null }; },
      delete: () => ({ in: async (k: string, ids: unknown[]) => { appels.suppressions += ids.length; tables[table] = tables[table].filter((r) => !ids.includes(r[k])); return { error: null }; } }),
    };
  };
  return { client: { from: requete } as unknown as SupabaseClient, tables, appels };
}

const onglet = (lignes: string[][]) => ({ nom: "Suivi", entetes: ["Nom", "Prénom"], lignes, numeros: lignes.map((_, i) => i + 2) });

describe("tableau de suivi : mise à jour en place", () => {
  it("ne réécrit que les lignes changées et garde les identifiants des autres", async () => {
    const { client, tables, appels } = baseSimulee({});
    await ecrireTableau(client, [onglet([["Dupont", "Jean"], ["Martin", "Léa"], ["Durand", "Paul"]])], "f.xlsx");
    expect(tables.tableau_lignes).toHaveLength(3);
    const idsAvant = tables.tableau_lignes.map((l) => l.id);
    appels.insertions = 0; appels.misesAJour = 0; appels.suppressions = 0;

    // Relecture : ligne 3 modifiée, ligne 4 retirée, une ligne 5 ajoutée.
    const bilan = await ecrireTableau(client, [{ nom: "Suivi", entetes: ["Nom", "Prénom"], lignes: [["Dupont", "Jean"], ["Martin", "Léo"], ["Petit", "Zoé"]], numeros: [2, 3, 5] }], "f.xlsx");
    expect(tables.tableau_onglets).toHaveLength(1);
    expect(tables.tableau_lignes.map((l) => l.position).sort()).toEqual([2, 3, 5]);
    expect(tables.tableau_lignes.find((l) => l.position === 2)!.id).toBe(idsAvant[0]);
    expect(tables.tableau_lignes.find((l) => l.position === 3)!.id).toBe(idsAvant[1]);
    expect((tables.tableau_lignes.find((l) => l.position === 3)!.valeurs as Record<string, string>)["Prénom"]).toBe("Léo");
    expect(appels.suppressions).toBe(1);
    expect(bilan.modifiees).toBe(3);
    expect(bilan.lignes).toBe(3);

    // Relecture identique : rien n'est réécrit.
    const encore = await ecrireTableau(client, [{ nom: "Suivi", entetes: ["Nom", "Prénom"], lignes: [["Dupont", "Jean"], ["Martin", "Léo"], ["Petit", "Zoé"]], numeros: [2, 3, 5] }], "f.xlsx");
    expect(encore.modifiees).toBe(0);
  });
});
