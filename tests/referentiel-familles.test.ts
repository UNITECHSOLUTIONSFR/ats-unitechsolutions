import { describe, expect, it } from "vitest";
import { famillesDansTexte, cleFamille, decouperCompetence, familleDe, indexerReferentiel, nomPourNouvelle, resoudreCompetence } from "@/lib/matching/referentiel";

describe("familles de compétences", () => {
  it("ramène les variantes à leur famille", () => {
    for (const n of [".NET 8", "ASP.NET MVC", "ADO.NET", ".NET Framework", ".NET Core 6", "dotnet", "ASP.NET Web API"]) expect(familleDe(n)).toBe(".NET");
    expect(familleDe("Angular 18+")).toBe("Angular");
    expect(familleDe("Java 17")).toBe("Java");
    expect(familleDe("ReactJS")).toBe("React");
    expect(familleDe("SQL Server Management Studio")).toBe("SQL Server");
    expect(familleDe("Webservices REST")).toBe("API REST");
    expect(familleDe("Kafka")).toBeNull();
  });
  it("repère les technologies d'un intitulé", () => {
    expect(famillesDansTexte("Concepteur-Développeur .NET – Technologies émergentes senior")).toEqual([".NET"]);
    expect(famillesDansTexte("Tech Lead Senior Java / Angular")).toEqual(["Java", "Angular"]);
  });
  it("retire les numéros de version et les parenthèses", () => {
    expect(cleFamille("Spring Boot 3.3+")).toBe("spring boot");
    expect(cleFamille(".NET (C#)")).toBe(".net");
    expect(nomPourNouvelle("Kafka 3.6")).toBe("Kafka");
  });
  it("découpe les noms doubles mais garde les sigles", () => {
    expect(decouperCompetence("C# / .NET")).toEqual(["C#", ".NET"]);
    expect(decouperCompetence("Webservices REST et JSON")).toEqual(["Webservices REST", "JSON"]);
    expect(decouperCompetence("CI/CD")).toEqual(["CI/CD"]);
    expect(decouperCompetence("PL/SQL")).toEqual(["PL/SQL"]);
    expect(decouperCompetence("Backup et restore")).toEqual(["Backup et restore"]);
  });
  it("une variante retrouve la compétence principale du référentiel", () => {
    const index = indexerReferentiel([
      { id: "net", nom_canonique: ".NET", synonymes: [".net"] },
      { id: "net8", nom_canonique: ".NET 8", synonymes: [".net 8"] },
      { id: "kafka", nom_canonique: "Apache Kafka", synonymes: ["kafka"] },
    ]);
    expect(resoudreCompetence("ASP.NET Core", index)?.id).toBe("net");
    expect(resoudreCompetence(".NET 8", index)?.id).toBe("net");
    expect(resoudreCompetence("Kafka", index)?.id).toBe("kafka");
  });
});

import { bornerMission } from "@/lib/ai/schemas";
describe("lecture des fiches de poste", () => {
  it("garde au plus 4 compétences obligatoires (les plus importantes)", () => {
    const comp = (nom: string, importance: number) => ({ nom, obligatoire: true, importance, annees_min: null });
    const m = bornerMission({ intitule: "x", client: null, localisation: null, date_debut: null, duree: null, annees_min: null, seniorite: null, resume: "", competences: [comp("A", 2), comp("B", 3), comp("C", 3), comp("D", 1), comp("E", 3), comp("F", 3)] });
    expect(m.competences.filter((c) => c.obligatoire).map((c) => c.nom)).toEqual(["B", "C", "E", "F"]);
    expect(m.competences.find((c) => c.nom === "A")).toMatchObject({ obligatoire: false, importance: 3 });
  });
});
