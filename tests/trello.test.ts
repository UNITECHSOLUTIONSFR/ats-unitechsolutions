import { describe, expect, it } from "vitest";
import { cleIntitule, lireColonne, lireTitre, lireTJM, sansTJM } from "@/lib/trello/regles";

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
