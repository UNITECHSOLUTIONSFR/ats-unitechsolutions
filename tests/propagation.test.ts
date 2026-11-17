import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ clientSupabaseAdmin: () => ({}) }));
vi.mock("@/lib/sharepoint", () => ({ graphEnvoyer: async () => ({}), graphGet: async () => ({}), graphTeleverser: async () => ({}) }));
const { valeurPourCase } = await import("@/lib/consultants/propagation");

describe("fiche modifiée → cases de l'Excel", () => {
  const fiche = { prenom: "Léa", nom: "Martin", trigramme: "LMA", telephone_e164: "+33612345678", disponible_le: "2027-01-15", disponibilite: "Immédiate", email: "lea@ex.fr" };
  it("valeurs écrites comme dans l'Excel (téléphone 06…, date JJ/MM/AAAA, nom complet)", () => {
    expect(valeurPourCase("telephone", fiche)).toBe("06 12 34 56 78");
    expect(valeurPourCase("disponibilite", fiche)).toBe("15/01/2027");
    expect(valeurPourCase("disponibilite", { ...fiche, disponible_le: null })).toBe("Immédiate");
    expect(valeurPourCase("nom_complet", fiche)).toBe("Léa Martin");
    expect(valeurPourCase("prenom", { ...fiche, prenom: "—" })).toBe("");
    expect(valeurPourCase("statut", fiche)).toBeUndefined(); // géré par l'Excel lui-même
  });
});
