import { describe, expect, it } from "vitest";
import { candidatsV4, contientObligatoires } from "@/lib/matching/v4";
import { estPertinent, SEUIL_PERTINENT, type LigneClassement } from "@/lib/matching/classement";
import type { LigneV3 } from "@/lib/matching/v3-calcul";

const ex = (ordre: number, poids: number, x: boolean) => ({ ordre, libelle: `e${ordre}`, poids, s: 0.4, x, role: null, entreprise: null, debut: null, fin: null, duree_mois: null });
const ligne = (id: string, sim: number, exigences = [ex(1, 3, false)]): LigneV3 => ({ consultant_id: id, metier_sim: sim, metier_role: null, exigences, annees: null });

describe("nouveau matching (24/11/2026)", () => {
  it("compétences obligatoires : toutes trouvées dans le CV, sinon non", () => {
    expect(contientObligatoires(ligne("a", 0.2, [ex(1, 3, true), ex(2, 2, true), ex(3, 1, false)]))).toBe(true);
    expect(contientObligatoires(ligne("a", 0.2, [ex(1, 3, true), ex(2, 2, false)]))).toBe(false);
    expect(contientObligatoires(ligne("a", 0.2, [ex(1, 1, true)]))).toBe(false); // aucune obligatoire : ne suffit pas
  });

  it("option B : filtre métier OU toutes les compétences obligatoires", () => {
    const lignes = [ligne("m1", 0.7), ligne("m2", 0.69), ligne("m3", 0.68), ligne("loin", 0.3), ligne("loinMaisCompetent", 0.3, [ex(1, 3, true)])];
    const ids = candidatsV4(lignes).map((l) => l.consultant_id);
    expect(ids).toEqual(["m1", "m2", "m3", "loinMaisCompetent"]);
    expect(candidatsV4(lignes, new Set(["loin", "m1"])).map((l) => l.consultant_id)).toEqual(["m1"]);
  });

  it("affichage à partir de 31", () => {
    expect(SEUIL_PERTINENT).toBe(31);
    const l = (note: number) => ({ resultat: { elimine: false }, eligible: true, avisIA: { note } }) as unknown as LigneClassement;
    expect(estPertinent(l(31))).toBe(true);
    expect(estPertinent(l(30))).toBe(false);
  });
});
