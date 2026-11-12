import { describe, expect, it } from "vitest";
import { dureeDepuisPeriode } from "@/lib/cv-unitech/generation";

const auj = new Date("2026-11-12");
describe("durée d'une mission", () => {
  it("lit les formats courants", () => {
    expect(dureeDepuisPeriode("Janvier 2024 – Juin 2026", auj)).toBe("2 ans 6 mois");
    expect(dureeDepuisPeriode("03/2021 - Aujourd'hui", auj)).toBe("5 ans 9 mois");
    expect(dureeDepuisPeriode("2019 – 2021", auj)).toBe("3 ans");
    expect(dureeDepuisPeriode("Septembre 2025 à février 2026", auj)).toBe("6 mois");
  });
  it("null si la période ne se lit pas", () => {
    expect(dureeDepuisPeriode("Depuis longtemps", auj)).toBeNull();
  });
});

import { vi } from "vitest";
vi.mock("server-only", () => ({}));
describe("contrôle des tâches", async () => {
  const { compterPuces } = await import("@/lib/cv-unitech/service");
  it("compte les lignes à puce d'un CV", () => {
    expect(compterPuces("Missions :\n- Concevoir l'API\n• Piloter l'équipe\n1. Déployer\nTexte libre\n▪ Tester")).toBe(4);
  });
});
