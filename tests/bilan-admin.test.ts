import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/sync/taches", () => ({ TACHES: {} }));
import { etatTache, niveauEcheance } from "@/lib/admin/bilan";

const maintenant = Date.parse("2026-11-11T09:00:00Z");
describe("bilan quotidien", () => {
  it("tâche réussie récemment = OK, trop ancienne = en retard, échec plus récent = échec", () => {
    expect(etatTache("excel", maintenant, "2026-11-11T01:00:00Z", null)).toBe("ok");
    expect(etatTache("emails", maintenant, "2026-11-11T01:00:00Z", null)).toBe("retard");
    expect(etatTache("excel", maintenant, "2026-11-10T01:00:00Z", "2026-11-11T01:00:00Z")).toBe("echec");
    expect(etatTache("cv", maintenant, null, null)).toBe("retard");
  });
  it("échéances : 30 jours = bientôt, 7 jours = urgent, passée = expirée", () => {
    expect(niveauEcheance("2026-12-31", maintenant).niveau).toBe("ok");
    expect(niveauEcheance("2026-11-30", maintenant).niveau).toBe("bientot");
    expect(niveauEcheance("2026-11-15", maintenant).niveau).toBe("urgent");
    expect(niveauEcheance("2026-11-01", maintenant).niveau).toBe("expire");
    expect(niveauEcheance(null, maintenant).niveau).toBe("inconnu");
  });
});
