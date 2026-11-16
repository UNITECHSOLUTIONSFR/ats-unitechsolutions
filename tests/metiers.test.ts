import { describe, expect, it } from "vitest";
import { compatibiliteMetier, familleMetier } from "@/lib/matching/metiers";

describe("Familles de métier", () => {
  it.each([
    ["Testeur QA fonctionnel", "test"], ["Ingénieur QA", "test"], ["SAP Test Manager / Test Lead", "test"], ["Ingénieur de test", "test"],
    ["Développeur Java/J2EE", "dev"], ["Développeur Fullstack", "dev"], ["Tech Lead Front end", "dev"], ["Développeur iOS Senior", "dev"],
    ["Data Engineer", "data"], ["Tech Lead Data", "data"], ["Concepteur Power BI / Data Analyst BI", "data"], ["Développeur BI / Décisionnel N4", "data"],
    ["Chef de projet MOE", "pilotage"], ["Chef de projet Recette fonctionnelle", "pilotage"], ["Engineering Manager", "pilotage"], ["Scrum Master", "pilotage"],
    ["Product Owner", "produit"], ["Business Analyst", "produit"], ["AMOA", "produit"], ["PO Data & IA", "produit"],
    ["DevOps Engineer", "devops"], ["Ingénieur DevOps", "devops"], ["Architecte d'entreprise", "architecture"], ["Architecte Sécurité compétences IA", "securite"],
    ["Administrateur système Linux", "infra"], ["Technicien Support", "infra"], ["Expert Ivalua confirmé", "erp"], ["Expert Technico Fonctionnel CRM360 Dynamics", "erp"],
  ])("« %s » → %s", (t, f) => expect(familleMetier(t)).toBe(f));
  it("intitulé non reconnu : pas de famille", () => expect(familleMetier("Consultant R&D")).toBeNull());
  it("un développeur n'est pas retenu pour une mission de test ; métiers voisins acceptés", () => {
    expect(compatibiliteMetier("test", "dev")).toBe(0);
    expect(compatibiliteMetier("dev", "devops")).toBe(0.6);
    expect(compatibiliteMetier("data", "data")).toBe(1);
    expect(compatibiliteMetier("test", null)).toBeNull();
  });
});
