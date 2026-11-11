import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { SchemaCriteresRecherche } from "@/lib/ai/schemas";
import { compatibiliteLieu, motifsPoste } from "@/lib/recherche/moteur";
import { filtrer } from "@/app/(app)/recherche/recherche";
import type { ResultatRecherche } from "@/lib/recherche/moteur";

describe("recherche en conversation", () => {
  it("le format de réponse demandé à l'IA est valide", () => {
    expect(() => zodOutputFormat(SchemaCriteresRecherche)).not.toThrow();
    const ok = SchemaCriteresRecherche.safeParse({ poste: "DevOps", competences: [{ nom: "Jenkins", obligatoire: true }], annees_min: 5, annees_max: 6, seniorite: null, lieu: "Paris", mots_cles: [], reponse: "OK" });
    expect(ok.success).toBe(true);
  });

  it("lieu : mobilité d'abord, puis localisation, Île-de-France reconnue", () => {
    expect(compatibiliteLieu("Paris", "Nanterre (92)", null)).toBe("ok");
    expect(compatibiliteLieu("Paris", "Lyon", "France")).toBe("ok");
    expect(compatibiliteLieu("Paris", "Lyon", null)).toBe("autre");
    expect(compatibiliteLieu("Paris", null, null)).toBe("inconnu");
    expect(compatibiliteLieu("Lyon", "Lyon 3e", null)).toBe("ok");
    expect(compatibiliteLieu(null, "Lyon", null)).toBe(null);
  });

  it("motifs du poste avec et sans accents", () => {
    expect(motifsPoste("Développeur Java")).toEqual(["%Développeur Java%", "%Developpeur Java%"]);
    expect(motifsPoste(null)).toEqual([]);
  });

  it("les filtres s'appliquent aux résultats", () => {
    const base = { prenom: "A", nom: "B", trigramme: "ABB", statut: "candidat", localisation: null, mobilite: null, seniorite: null, resume: null, disponibilite: null, telephone: null, email: null, word_url: null, pdf_url: null, competences: [], manquantes: [], raisons: [], lieu: null, extrait: null, intitule_poste: "DevOps" };
    const liste = [
      { ...base, id: "1", score: 90, elimine: false, annees: 6, word_url: "x" },
      { ...base, id: "2", score: 40, elimine: false, annees: 2 },
      { ...base, id: "3", score: 80, elimine: true, annees: 8 },
    ] as ResultatRecherche[];
    const f = { complets: true, scoreMin: 0, anneesMin: "", anneesMax: "", lieu: "tous" as const, statuts: [], avecWord: false, avecPdf: false, texte: "" };
    expect(filtrer(liste, f, "pertinence").map((r) => r.id)).toEqual(["1", "2"]);
    expect(filtrer(liste, { ...f, scoreMin: 50 }, "pertinence").map((r) => r.id)).toEqual(["1"]);
    expect(filtrer(liste, { ...f, complets: false, anneesMin: "5" }, "pertinence").map((r) => r.id)).toEqual(["1", "3"]);
    expect(filtrer(liste, { ...f, avecWord: true }, "pertinence").map((r) => r.id)).toEqual(["1"]);
  });
});
