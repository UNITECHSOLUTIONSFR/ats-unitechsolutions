import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// Matching du 17/11/2026 : présélection par le sens + compétences, note de l'IA, notes gardées.
const envois: { mission: string; profils: { ref: string; texte: string }[]; exemples: string }[] = [];
vi.mock("@/lib/ai", () => ({
  noterCandidats: async (mission: string, profils: { ref: string; texte: string }[], exemples: string) => {
    envois.push({ mission, profils, exemples });
    return { donnees: { notes: profils.map((p) => ({ ref: p.ref, note: p.texte.includes("Développeur") ? 30 : 88, raison: "r" })) }, modele: "m", promptVersion: "v", usages: [] };
  },
}));
vi.mock("@/lib/ai/journal", () => ({ enregistrerUsages: async () => {}, etatBudgetMois: async () => ({ depasse: false, depense: 0, plafond: 25 }) }));
// Sens : le profil « c » (aucune compétence citée, mais proche par le sens) doit être présélectionné et lu par l'IA.
vi.mock("@/lib/matching/empreintes", () => ({ assurerEmpreinteMission: async () => true, texteMission: () => "t" }));
const ligne = (id: string, titre: string, score: number, elimine = false) => ({
  consultant_id: id, prenom: "Jean", nom: "SECRET", trigramme: "JSE", telephone_e164: "+33600000000", email: "x@y.fr", intitule_poste: titre,
  disponibilite: null, disponible_le: null, pdf_anonyme_url: null, word_url: null, annees_experience: 5,
  resultat: { score, elimine, motifsElimination: [], raisons: [], alertes: [] },
});
const inclusRecus: unknown[] = [];
vi.mock("@/lib/matching/classement", () => ({
  classementMission: async (_s: unknown, _m: string, _l: number, inclure: string[]) => {
    inclusRecus.push(inclure);
    return [ligne("a", "Développeur Java", 90), ligne("b", "Testeur QA", 80), ligne("c", "Recetteur", 20), ligne("d", "Inconnu", 70, true)];
  },
}));
const { classerMission } = await import("@/lib/matching/hybride");

function base() {
  const tables: Record<string, Record<string, unknown>[]> = {
    missions: [{ id: "m", intitule: "Testeur QA", client: "X", texte_besoin: "Recette fonctionnelle", localisation: null, mission_competences: [] }],
    avis_matching: [], profils: [], reglages: [{ cle: "matching_lecture_ia", valeur: true }], consultant_competences: [], textes_consultants: [], propositions: [],
  };
  const client = {
    rpc: async () => ({ data: [{ consultant_id: "c", similarite: 0.82 }, { consultant_id: "b", similarite: 0.8 }] }),
    from(t: string) {
      const f: ((r: Record<string, unknown>) => boolean)[] = [];
      const q: Record<string, unknown> = {
        select: () => q, order: () => q, limit: () => q, eq: (k: string, v: unknown) => { f.push((r) => r[k] === v); return q; },
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

describe("Matching : sens + compétences, puis note de l'IA", () => {
  it("profil proche par le sens présélectionné ; classé par la note de l'IA ; sans nom ni coordonnées ; notes gardées", async () => {
    const { client, tables } = base();
    const r = await classerMission(client, "m");
    expect(inclusRecus[0]).toEqual(["c", "b"]); // les proches par le sens sont évalués même sans mot-clé
    expect(envois[0].profils).toHaveLength(3); // a, b, c lus ; d écarté (filtre éliminatoire) non envoyé
    expect(r.map((l) => l.consultant_id)).toEqual(["c", "b", "a", "d"]); // meilleure note d'abord (égalité : présélection), écartés en dernier
    expect(r[0].avisIA).toMatchObject({ note: 88, verdict: "pertinent" });
    expect(r[2].avisIA).toMatchObject({ note: 30, verdict: "hors_sujet" });
    expect(r[0].similarite).toBe(0.82);
    expect(JSON.stringify(envois[0])).not.toMatch(/SECRET|x@y\.fr|\+33600000000/);
    expect(tables.avis_matching).toHaveLength(3);
    await classerMission(client, "m");
    expect(envois).toHaveLength(1); // déjà notés : aucun nouvel appel
  });
  it("FinOps : relecture coupée = mission déjà notée jamais relue ; mission nouvelle lue une fois", async () => {
    const { client, tables } = base();
    tables.reglages = [];
    const avant = envois.length;
    await classerMission(client, "m"); // mission sans aucune note : lue une fois
    expect(envois.length).toBe(avant + 1);
    await classerMission(client, "m");
    expect(envois.length).toBe(avant + 1);
  });
});
