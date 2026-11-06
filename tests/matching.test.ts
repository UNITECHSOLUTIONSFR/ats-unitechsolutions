import { describe, expect, it } from "vitest";
import { classer, scorerConsultant, type MissionAScorer } from "@/lib/matching/score";
import { indexerReferentiel, resoudreCompetence } from "@/lib/matching/referentiel";

const AUJ = new Date("2026-11-06");

const mission: MissionAScorer = {
  competences: [
    { competence_id: "java", nom: "Java", obligatoire: true, importance: 3, annees_min: 5 },
    { competence_id: "spring", nom: "Spring Boot", obligatoire: false, importance: 2 },
    { competence_id: "k8s", nom: "Kubernetes", obligatoire: false, importance: 1 },
  ],
  seniorite: "senior",
  date_debut: "2026-12-01",
};

describe("score de matching", () => {
  it("profil idéal : 100", () => {
    const r = scorerConsultant(
      mission,
      {
        competences: [{ competence_id: "java", annees: 8 }, { competence_id: "spring" }, { competence_id: "k8s" }],
        seniorite: "senior",
        disponible_le: "2026-11-15",
        similarite: 0.92,
      },
      undefined,
      AUJ,
    );
    expect(r.elimine).toBe(false);
    expect(r.score).toBe(100);
    expect(r.raisons.map((x) => x.critere)).toEqual(["competences", "annees", "seniorite", "disponibilite", "semantique"]);
  });

  it("compétence obligatoire absente : éliminé, avec le motif", () => {
    const r = scorerConsultant(mission, { competences: [{ competence_id: "spring" }] }, undefined, AUJ);
    expect(r.elimine).toBe(true);
    expect(r.motifsElimination[0]).toContain("Java");
  });

  it("score partiel explicable", () => {
    const r = scorerConsultant(
      mission,
      {
        competences: [{ competence_id: "java", annees: 2.5 }],
        seniorite: "confirme",
        disponibilite: "Immédiate",
      },
      undefined,
      AUJ,
    );
    // Sans similarité : 80 points répartis, ramenés sur 100.
    // compétences 3/6 -> 0,5 ; années 2,5/5 -> 0,5 ; séniorité 1 niveau d'écart -> 0,5 ; dispo 1
    // (45*0,5 + 15*0,5 + 10*0,5 + 10*1) / 80 * 100 = 56,25
    expect(r.score).toBe(56.3);
    const comp = r.raisons.find((x) => x.critere === "competences")!;
    expect(comp.texte).toContain("1/3");
    expect(comp.texte).toContain("manque : Spring Boot, Kubernetes");
  });

  it("disponibilité obligatoire et alerte de disponibilité ancienne", () => {
    const r = scorerConsultant(
      { ...mission, disponibilite_obligatoire: true },
      {
        competences: [{ competence_id: "java", annees: 6 }],
        disponible_le: "2027-03-01",
        disponibilite_maj_le: "2026-05-01",
      },
      undefined,
      AUJ,
    );
    expect(r.elimine).toBe(true);
    expect(r.alertes[0]).toMatch(/depuis 6 mois/);
  });

  it("classement : éliminés en dernier, puis score décroissant", () => {
    const liste = [
      { id: "a", resultat: { score: 90, elimine: true } },
      { id: "b", resultat: { score: 40, elimine: false } },
      { id: "c", resultat: { score: 75, elimine: false } },
    ] as never[];
    expect(classer(liste).map((x: { id: string }) => x.id)).toEqual(["c", "b", "a"]);
  });
});

describe("référentiel de compétences", () => {
  const index = indexerReferentiel([
    { id: "1", nom_canonique: "React", synonymes: ["react", "reactjs", "react.js"] },
    { id: "2", nom_canonique: "C#", synonymes: ["c#", "csharp"] },
  ]);
  it.each(["React", "ReactJS", "react.js", "React JS", " REACT "])("%s -> React", (nom) => {
    expect(resoudreCompetence(nom, index)?.id).toBe("1");
  });
  it("C# et compétence inconnue", () => {
    expect(resoudreCompetence("C#", index)?.id).toBe("2");
    expect(resoudreCompetence("Cobol", index)).toBeNull();
  });
});
