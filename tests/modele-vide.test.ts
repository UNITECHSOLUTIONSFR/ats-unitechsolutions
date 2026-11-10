import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai", () => ({}));
vi.mock("@/lib/ai/config", () => ({ MODELES: {} }));
vi.mock("@/lib/ai/journal", () => ({}));
vi.mock("@/lib/sharepoint", () => ({}));
vi.mock("@/lib/matching/competences", () => ({}));
vi.mock("@/lib/analyse-cv/selection", () => ({}));
vi.mock("@/lib/analyse-cv/enregistrement", () => ({}));
import { modeleUnitechVide } from "@/lib/analyse-cv/coeur";

describe("modèle CV Unitech non rempli", () => {
  it("reconnaît les textes d'exemple du modèle", () => {
    expect(modeleUnitechVide("PROFIL\nDiplôme Universitaire de Cambridge\nRôle du consultant dans le projet\n- Détail 1")).toBe(true);
  });
  it("ne signale pas un vrai CV", () => {
    expect(modeleUnitechVide("PROFIL\nIngénieur Java, 8 ans\nRôle : développeur back-end chez SNCF")).toBe(false);
    expect(modeleUnitechVide(null)).toBe(false);
  });
});
