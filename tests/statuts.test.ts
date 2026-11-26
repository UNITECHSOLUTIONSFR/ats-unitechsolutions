import { describe, expect, it } from "vitest";
import { pastilleStatut, STATUTS_EXCEL } from "@/lib/consultants/statuts";
import { filtreRapide } from "@/lib/tableau/modele";

describe("statuts de la fiche (26/11/2026)", () => {
  it("pastilles : Unitech en mission (bleu), ailleurs (orange), ne pas contacter (rouge), rien sinon", () => {
    expect(pastilleStatut("en_mission_unitech")?.texte).toBe("Unitech · en mission");
    expect(pastilleStatut("en_mission_ailleurs")?.classes).toContain("orange");
    expect(pastilleStatut("ne_pas_contacter")?.classes).toContain("red");
    expect(pastilleStatut("candidat")).toBeNull();
  });
  it("les nouveaux statuts ne sont jamais écrits dans l'Excel", () => {
    expect(STATUTS_EXCEL.has("ne_pas_contacter")).toBe(false);
    expect(STATUTS_EXCEL.has("candidat")).toBe(true);
  });
  it("filtres rapides de la liste Consultants", () => {
    const l = (statut: string) => ({ id: "x", position: 1, consultant_id: "c", valeurs: {}, meta: { statut } });
    expect(filtreRapide(l("ne_pas_contacter"), "ne_pas_contacter", Date.now())).toBe(true);
    expect(filtreRapide(l("candidat"), "unitech", Date.now())).toBe(false);
  });
});
