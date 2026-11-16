import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const envois: { mission: string; profils: { ref: string; texte: string }[] }[] = [];
vi.mock("@/lib/ai", () => ({
  trierCandidats: async (mission: string, profils: { ref: string; texte: string }[]) => {
    envois.push({ mission, profils });
    return { donnees: { avis: profils.map((p) => ({ ref: p.ref, verdict: p.texte.includes("Développeur") ? "hors_sujet" : "pertinent", raison: "r" })) }, modele: "m", promptVersion: "v", usages: [] };
  },
}));
vi.mock("@/lib/ai/journal", () => ({ enregistrerUsages: async () => {}, etatBudgetMois: async () => ({ depasse: false, depense: 0, plafond: 25 }) }));
const { trierParIA } = await import("@/lib/matching/tri-ia");

function base() {
  const tables: Record<string, Record<string, unknown>[]> = {
    missions: [{ id: "m", intitule: "Testeur QA", client: "X", texte_besoin: "Recette fonctionnelle", localisation: null, mission_competences: [] }],
    avis_matching: [], profils: [], consultant_competences: [], textes_consultants: [],
  };
  const client = {
    from(t: string) {
      const f: ((r: Record<string, unknown>) => boolean)[] = [];
      const q: Record<string, unknown> = {
        select: () => q, eq: (k: string, v: unknown) => { f.push((r) => r[k] === v); return q; },
        in: (k: string, v: unknown[]) => { f.push((r) => v.includes(r[k])); return q; },
        maybeSingle: async () => ({ data: tables[t].filter((r) => f.every((x) => x(r)))[0] ?? null }),
        upsert: async (v: Record<string, unknown>[]) => { tables[t].push(...v); return { error: null }; },
        then: (ok: (r: unknown) => unknown) => Promise.resolve({ data: tables[t].filter((r) => f.every((x) => x(r))) }).then(ok),
      };
      return q;
    },
  };
  return { client: client as unknown as SupabaseClient, tables };
}
const ligne = (id: string, titre: string, score: number, elimine = false) => ({
  consultant_id: id, prenom: "Jean", nom: "SECRET", trigramme: "JSE", telephone_e164: "+33600000000", email: "x@y.fr", intitule_poste: titre,
  disponibilite: null, disponible_le: null, pdf_anonyme_url: null, word_url: null, annees_experience: 5,
  resultat: { score, elimine, motifsElimination: [], raisons: [], alertes: [] },
});

describe("Matching avec IA", () => {
  it("l'IA reçoit les profils sans nom ni coordonnées ; pertinents d'abord, hors sujet en bas ; avis gardés", async () => {
    const { client, tables } = base();
    const r = await trierParIA(client, "m", [ligne("a", "Développeur Java", 90), ligne("b", "Testeur QA", 80), ligne("c", "Inconnu", 70, true)]);
    expect(r.map((l) => l.consultant_id)).toEqual(["b", "a", "c"]);
    expect(r[1].avisIA?.verdict).toBe("hors_sujet");
    const envoye = JSON.stringify(envois[0]);
    expect(envoye).not.toMatch(/SECRET|x@y\.fr|\+33600000000/);
    expect(envois[0].profils).toHaveLength(2); // le profil écarté n'est pas envoyé
    expect(tables.avis_matching).toHaveLength(2);
    await trierParIA(client, "m", [ligne("a", "Développeur Java", 90), ligne("b", "Testeur QA", 80)]);
    expect(envois).toHaveLength(1); // déjà jugés : aucun nouvel appel
  });
});
