import { describe, expect, it } from "vitest";
import { dateISO, dureeMois, noterV3, periode, texteExperience, type LigneV3 } from "@/lib/matching/v3-calcul";

let ordre = 0;
const exig = (libelle: string, poids: number, s: number, role = "Business Analyst") =>
  ({ ordre: ++ordre, libelle, poids, s, role, entreprise: "EDF", debut: "2021-01-01", fin: null, duree_mois: 36 });
const ligne = (metier: number, exigences: LigneV3["exigences"], annees = 8): LigneV3 =>
  ({ consultant_id: "c", metier_sim: metier, metier_role: "Business Analyst", exigences, annees });

describe("Matching v3 : dates et textes", () => {
  it("dates lues sous plusieurs formes", () => {
    expect(dateISO("2021-03")).toBe("2021-03-01");
    expect(dateISO("03/2021")).toBe("2021-03-01");
    expect(dateISO("2019")).toBe("2019-01-01");
    expect(dateISO("en cours")).toBeNull();
  });
  it("durée en mois, poste en cours compté jusqu'à aujourd'hui", () => {
    expect(dureeMois("2020-01-01", "2020-12-01")).toBe(12);
    expect(dureeMois("2024-01-01", null, new Date("2024-06-15"))).toBe(6);
    expect(dureeMois(null, null)).toBeNull();
  });
  it("période lisible", () => {
    expect(periode("2019-01-01", "2023-05-01")).toBe("2019 – 2023");
    expect(periode("2022-01-01", null)).toBe("depuis 2022");
  });
  it("texte d'une expérience sans coordonnées", () => {
    expect(texteExperience({ role: "PO", metier: "Product Owner", entreprise: "SNCF", technologies: ["Jira"], responsabilites: "Backlog." }))
      .toBe("PO (Product Owner) chez SNCF\nBacklog.\nTechnologies : Jira");
  });
});

describe("Matching v3 : note avec preuves", () => {
  it("même métier et exigences prouvées : pertinent, avec la preuve", () => {
    const n = noterV3(ligne(0.72, [exig("SAP", 3, 0.66), exig("Recette", 1, 0.6)]), 5, undefined, { metierSeuil: 0.6, metierHaut: 0.72, exigencesUtiles: new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]) });
    expect(n.memeMetier).toBe(true);
    expect(n.note).toBeGreaterThanOrEqual(90);
    expect(n.analyse[0]).toMatchObject({ exigence: "SAP", atteint: true });
    expect(n.analyse[0].explication).toMatch(/Business Analyst chez EDF \(depuis 2021, 3 an\(s\)\)/);
  });
  it("autre métier (un comptable pour un Application Manager) : écarté, 30 au plus", () => {
    const n = noterV3({ ...ligne(0.38, [exig("SAP", 3, 0.7)]), metier_role: "Comptable" }, null, undefined, { metierSeuil: 0.6, metierHaut: 0.7, exigencesUtiles: new Set() });
    expect(n.memeMetier).toBe(false);
    expect(n.note).toBeLessThanOrEqual(30);
    expect(n.raison).toBe("Autre métier : Comptable");
  });
  it("exigence obligatoire non prouvée : jamais pertinent (55 au plus)", () => {
    const n = noterV3(ligne(0.75, [exig("ServiceNow", 3, 0.4), exig("ITIL", 1, 0.7)]), null);
    expect(n.note).toBeLessThanOrEqual(55);
    expect(n.analyse[0].atteint).toBe(false);
  });
  it("années insuffisantes : 10 points de moins", () => {
    const a = noterV3(ligne(0.7, [exig("Java", 2, 0.62)], 10), 8).note;
    const b = noterV3(ligne(0.7, [exig("Java", 2, 0.62)], 3), 8).note;
    expect(a - b).toBe(10);
  });
});

describe("Matching v3 : années d'expérience", () => {
  it("périodes qui se chevauchent comptées une fois", async () => {
    const { anneesSansChevauchement } = await import("@/lib/matching/v3-calcul");
    expect(anneesSansChevauchement([{ debut: "2018-01-01", fin: "2019-12-01" }, { debut: "2019-01-01", fin: "2020-12-01" }])).toBeCloseTo(3, 0);
    expect(anneesSansChevauchement([{ debut: null, fin: null }])).toBeNull();
  });
});

describe("Matching v3 : seuil propre à la mission", () => {
  it("seuil de métier = sous les meilleurs profils de la mission ; exigence que personne ne prouve non comptée", async () => {
    const { contexteMission } = await import("@/lib/matching/v3-calcul");
    const l = (s: number, e: { ordre: number; s: number; x?: boolean }[]) => ({ consultant_id: String(s), metier_sim: s, metier_role: "PO", annees: 5,
      exigences: e.map((x) => ({ ...x, libelle: "e", poids: 3, role: "PO", entreprise: null, debut: null, fin: null, duree_mois: null })) });
    const ctx = contexteMission([l(0.70, [{ ordre: 1, s: 0.2 }, { ordre: 2, s: 0.3, x: true }]), l(0.69, []), l(0.68, []), l(0.5, [])]);
    expect(ctx.metierSeuil).toBeCloseTo(0.61, 2);
    expect([...ctx.exigencesUtiles]).toEqual([2]);
    const n = noterV3(l(0.70, [{ ordre: 1, s: 0.2 }, { ordre: 2, s: 0.3, x: true }]), null, undefined, ctx);
    expect(n.analyse).toHaveLength(1);
    expect(n.note).toBeGreaterThanOrEqual(80);
  });
});
