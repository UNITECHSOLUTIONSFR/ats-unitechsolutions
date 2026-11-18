import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai", () => ({ extraireCriteresMission: vi.fn() }));
vi.mock("@/lib/ai/journal", () => ({ enregistrerUsages: vi.fn() }));
const { motifSynonyme, motifsCriteres } = await import("@/lib/matching/criteres");

describe("matching v2 : motifs de recherche des critères", () => {
  it("ignore les accents, protège les caractères spéciaux et borne les sigles courts", () => {
    expect(motifSynonyme("Développeur")).toBe("\\md[eéèêë]v[eéèêë]l[oôöó]pp[eéèêë][uùûüú]r");
    expect(motifSynonyme("BA")).toBe("\\mb[aàâäá]\\M");
    expect(motifSynonyme("p&c")).toBe("\\mp\\&[cç]\\M");
    expect(motifSynonyme("assurance dommages")).toContain("[\\s\\-_/]+");
    expect(motifSynonyme(" ")).toBeNull();
  });
  it("un groupe par critère : métier d'abord, synonymes réunis", () => {
    const g = motifsCriteres({ metier: { libelle: "Business analyst", synonymes: ["ba", "analyste métier"] }, obligatoires: [{ critere: "Assurance IARD", synonymes: ["iard", "iardt"] }], souhaites: [] });
    expect(g).toHaveLength(2);
    expect(g[0].libelle).toBe("Business analyst");
    expect(g[1].motif.startsWith("(") && g[1].motif.includes("|")).toBe(true);
  });
});
