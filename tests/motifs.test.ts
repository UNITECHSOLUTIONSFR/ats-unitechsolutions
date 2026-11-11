import { describe, expect, it } from "vitest";
import { motifCompetence } from "@/lib/matching/motifs";

const trouve = (nom: string, syn: string[], texte: string) => new RegExp(motifCompetence(nom, syn)!).test(texte.toLowerCase());
describe("motifs de recherche des compétences dans les textes", () => {
  it("mots entiers, symboles compris", () => {
    expect(trouve("Java", [], "Développeur Java / Spring")).toBe(true);
    expect(trouve("Java", [], "JavaScript et TypeScript")).toBe(false);
    expect(trouve("C#", [], "C#, .NET Core")).toBe(true);
    expect(trouve("C", [], "C#")).toBe(false);
    expect(trouve(".NET", ["asp.net", "dotnet"], "Expérience ASP.NET MVC")).toBe(true);
    expect(trouve(".NET", ["asp.net"], "internet")).toBe(false);
    expect(trouve("SQL Server", [], "MS SQL-Server 2019")).toBe(true);
    expect(trouve("Google Apigee", [], "Développement de proxies Apigee X")).toBe(true);
    expect(trouve("Modélisation de données", [], "modelisation de donnees")).toBe(true);
  });
});
