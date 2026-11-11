import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/sync/excel", () => ({}));
vi.mock("@/lib/sync/cv", () => ({}));
vi.mock("@/lib/sync/sauvegarde", () => ({}));
vi.mock("@/lib/analyse-cv/coeur", () => ({}));
vi.mock("@/lib/analyse-cv/illisibles", () => ({}));
vi.mock("@/lib/cv-unitech/service", () => ({}));
vi.mock("@/lib/emails/traitement", () => ({}));
vi.mock("@/lib/emails/envoi", () => ({}));
vi.mock("@/lib/relance/envoi", () => ({}));
import { tacheDejaFaite } from "@/lib/sync/taches";

function base(lignes: { debut: string; statut: string }[]) {
  const q = { select: () => q, eq: () => q, gte: () => q, order: () => q, limit: async () => ({ data: lignes }) };
  return { from: () => q } as never;
}
const maintenant = Date.parse("2026-11-12T01:05:00Z");

describe("pas de double passage des tâches planifiées", () => {
  it("tâche déjà réussie récemment : ignorée", async () => {
    expect(await tacheDejaFaite("excel", base([{ debut: "2026-11-12T01:00:00Z", statut: "termine" }]), maintenant)).toMatch(/déjà faite/);
  });
  it("tâche en cours depuis moins de 15 minutes : ignorée", async () => {
    expect(await tacheDejaFaite("emails", base([{ debut: "2026-11-12T01:00:00Z", statut: "en_cours" }]), maintenant)).toBe("déjà en cours");
  });
  it("dernier passage en échec, ou en cours bloqué depuis longtemps : relancée", async () => {
    expect(await tacheDejaFaite("excel", base([{ debut: "2026-11-12T01:00:00Z", statut: "echec" }]), maintenant)).toBeNull();
    expect(await tacheDejaFaite("excel", base([{ debut: "2026-11-11T22:00:00Z", statut: "en_cours" }]), maintenant)).toBeNull();
  });
  it("la relance des disponibilités n'est jamais bloquée", async () => {
    expect(await tacheDejaFaite("relance", base([{ debut: "2026-11-12T01:04:00Z", statut: "termine" }]), maintenant)).toBeNull();
  });
});
