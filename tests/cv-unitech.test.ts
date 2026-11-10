import { readFileSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { genererDocx, nomsFichiers, type CVUnitech } from "@/lib/cv-unitech/generation";

export const EXEMPLE: CVUnitech = {
  trigramme: "ARO", titre: "Développeur Java senior", annees_experience: 9,
  adequation: { section: "Adéquation à la mission – RATP", resume: "Développeur Java & Angular de 9 ans d'expérience sur des SI critiques.", points: [{ libelle: "Java & Spring Boot", detail: "8 ans, Java 17 et Spring Boot 3 en production" }] },
  competences_metier: [{ domaine: "Développement back-end", points: ["Concevoir des API REST", "Optimiser les performances"] }],
  outils: [{ categorie: "Langages", elements: "Java, TypeScript, SQL" }],
  langues: [{ langue: "Anglais", niveau: "Professionnel" }],
  formations: [{ annee: "2015", intitule: "Diplôme d'ingénieur", etablissement: "INSA Lyon" }],
  experiences: [{ entreprise: "SNCF", poste: "Développeur Java", periode: "Janvier 2022 – Juin 2026", projet: "Billettique <temps réel>", missions: ["Développer les services", "Assurer la MCO"], environnement: "Java 17, Kafka, PostgreSQL" }],
};

describe("CV au format Unitech", () => {
  it("remplit le gabarit sans laisser de marqueur ni de donnée du modèle", async () => {
    const gabarit = readFileSync(path.resolve(__dirname, "../src/lib/cv-unitech/gabarit-unitech.docx"));
    const docx = await genererDocx(gabarit, EXEMPLE);
    const xml = await (await JSZip.loadAsync(docx)).file("word/document.xml")!.async("string");
    const texte = (xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).join("");
    expect(texte).toContain("ARO");
    expect(texte).toContain("DÉVELOPPEUR JAVA SENIOR");
    expect(texte).toContain("+ 9 ans d’expérience");
    expect(texte).toContain("ADÉQUATION À LA MISSION – RATP");
    expect(texte).toContain("Billettique &lt;temps réel&gt;"); // texte échappé
    expect(texte).not.toMatch(/\{\{|xxxx|BPCE|ASO/);
    expect(xml).toContain("Century Gothic");
  });
  it("nomme les fichiers selon la convention", () => {
    expect(nomsFichiers("Ana", "Roux", "ARO", "Développeur Java", "RATP")).toEqual({
      word: "UNITECH SOLUTIONS - CV Ana Roux - Développeur Java - RATP.docx",
      pdf: "UNITECH SOLUTIONS - CV ARO - Développeur Java - RATP.pdf",
    });
  });
});
