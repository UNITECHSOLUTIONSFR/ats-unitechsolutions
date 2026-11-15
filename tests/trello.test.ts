import { describe, expect, it } from "vitest";
import { cleIntitule, lireColonne, lireTitre, lireTJM, rapprocher, sansTJM } from "@/lib/trello/regles";

describe("Trello : colonnes du tableau des missions", () => {
  it.each([
    ["Missions en cours", "ouverte", null],
    ["Sourcing Anaelle", "ouverte", "Anaelle"],
    ["Sourcing Amadou", "ouverte", "Amadou"],
    ["Sourcing M CISSE", "ouverte", "M. Cissé"],
    ["Positionnement", "chez_client", null],
    ["Qualification", "chez_client", null],
    ["Soutenance à venir", "chez_client", null],
    ["Go", "pourvue", null],
    ["Mission terminée", "pourvue", null],
    ["Missions hold", "en_pause", null],
    ["Missions traitées sans positionnement", "fermee", null],
    ["Mission no-go", "fermee", null],
  ])("« %s » → %s", (colonne, statut, recruteur) => {
    expect(lireColonne(colonne)).toMatchObject({ statut, recruteur });
  });
  it("Sourcing Kefi et les colonnes inconnues sont ignorées", () => {
    expect(lireColonne("Sourcing Kefi")).toBeNull();
    expect(lireColonne("Idées")).toBeNull();
  });
  it("Missions en cours = à répartir", () => expect(lireColonne("Missions en cours")?.aRepartir).toBe(true));
});

describe("Trello : titre, TJM", () => {
  it("client avant le tiret, sinon pas de client", () => {
    expect(lireTitre("EDF – Architecte système Microsoft")).toEqual({ client: "EDF", intitule: "Architecte système Microsoft" });
    expect(lireTitre("RATP - Dev senior full stack")).toEqual({ client: "RATP", intitule: "Dev senior full stack" });
    expect(lireTitre("Lead testeur")).toEqual({ client: null, intitule: "Lead testeur" });
  });
  it("TJM repris à part et retiré du texte lu par l'IA", () => {
    const desc = "Mission Java Spring\nTJM : 550 € HT\nLieu : Paris\nTaux journalier max 600";
    expect(lireTJM(desc)).toBe("TJM : 550 € HT");
    expect(sansTJM(desc)).toBe("Mission Java Spring\nLieu : Paris");
    expect(lireTJM("Aucun prix ici")).toBeNull();
  });
  it("rapprochement des missions existantes par intitulé (accents, majuscules, ponctuation)", () => {
    expect(cleIntitule("Développeur  Java/Spring")).toBe(cleIntitule("developpeur java spring"));
  });
});

describe("Trello : rapprochement des missions déjà créées dans l'outil", () => {
  const missions = [
    { id: "m1", intitule: "Tech Lead Senior Java / Angular", client: "BPCE SA" },
    { id: "m2", intitule: "Développeur Full Stack Senior", client: "RATP" },
    { id: "m3", intitule: "Concepteur Power BI / Data Analyst BI junior", client: "e.SNCF Solutions" },
    { id: "m4", intitule: "Expert Authentification & MFA – Ilex Sign&GO", client: "Banque Postale" },
  ];
  it("même client et mots du poste en commun : relié ; sinon : non", () => {
    const liens = rapprocher(missions, [
      { id: "c1", name: "BPCE - Tech Lead Java Angular", desc: "" },
      { id: "c2", name: "RATP Dev - Développeur full stack senior", desc: "" },
      { id: "c3", name: "Data Analyst Power BI", desc: "Client : e.SNCF Solutions, Lyon" },
      { id: "c4", name: "Orange - Développeur Java", desc: "" },
      { id: "c5", name: "Banque Postale - Expert MFA Ilex", desc: "" },
    ]);
    expect(Object.fromEntries(liens)).toEqual({ c1: "m1", c2: "m2", c3: "m3", c5: "m4" });
  });
  it("une mission n'est reliée qu'à une seule carte (la plus proche)", () => {
    const liens = rapprocher([missions[0]], [
      { id: "a", name: "BPCE - Tech Lead Java", desc: "" },
      { id: "b", name: "BPCE - Tech Lead Senior Java Angular", desc: "" },
    ]);
    expect(Object.fromEntries(liens)).toEqual({ b: "m1" });
  });
});
