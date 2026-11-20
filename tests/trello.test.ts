import { describe, expect, it } from "vitest";
import { carteInformation, champsApresDeplacement, cleIntitule, lireColonne, lireTitre, lireTJM, rapprocher, sansTJM } from "@/lib/trello/regles";

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
  it("titre « Poste - Client - Contact »", () => {
    expect(lireTitre("Développeur Java Angular - URSAFF")).toEqual({ intitule: "Développeur Java Angular", client: "URSAFF" });
    expect(lireTitre("Data Engineer IA - SNCF - Amar")).toEqual({ intitule: "Data Engineer IA", client: "SNCF" });
    expect(lireTitre("Expert Ivalua confirmé | spécialiste de la solution - Agromousquetaires - Stecy")).toEqual({ intitule: "Expert Ivalua confirmé | spécialiste de la solution", client: "Agromousquetaires" });
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
      { id: "c1", name: "Tech Lead Java Angular - BPCE", desc: "" },
      { id: "c2", name: "Développeur full stack senior - RATP Dev", desc: "" },
      { id: "c3", name: "Data Analyst Power BI", desc: "Client : e.SNCF Solutions, Lyon" },
      { id: "c4", name: "Développeur Java - Orange", desc: "" },
      { id: "c5", name: "Expert MFA Ilex - Banque Postale", desc: "" },
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

import { lieuCourt, montantTJM } from "@/app/(app)/missions/liste";
describe("Grille des missions : lieu court et montant du TJM", () => {
  it("ville sans l'adresse", () => {
    expect(lieuCourt("16 rue du Général Alain Boissière, 75015 Paris")).toBe("Paris");
    expect(lieuCourt("Saint-Denis (17 rue des Bretons, 93100 Saint-Denis)")).toBe("Saint-Denis");
    expect(lieuCourt("DGOPI / DTEL, 6 avenue François Mitterrand, 93574 La Plaine Saint-Denis Cedex")).toBe("La Plaine Saint-Denis");
    expect(lieuCourt("Rennes")).toBe("Rennes");
  });
  it("montant sans le libellé", () => {
    expect(montantTJM("Prix d'achat maximum : 425 € HT")).toBe("425 € HT");
    expect(montantTJM("TJM 800 euros")).toBe("800 euros");
  });
});

describe("Trello : cartes d'information", () => {
  it("« IMPORTANT | … » n'est jamais une mission", () => {
    expect(carteInformation("IMPORTANT | % Contribution")).toBe(true);
    expect(carteInformation("important : lire avant")).toBe(true);
    expect(carteInformation("Développeur Java - URSAFF")).toBe(false);
  });
});

describe("colonnes d'entrée des nouvelles missions (17/11/2026)", () => {
  it("Missions en cours, Sourcing Anaelle et Sourcing Amadou font entrer une nouvelle carte ; pas Sourcing M CISSE", async () => {
    const { lireColonne } = await import("@/lib/trello/regles");
    expect(lireColonne("Missions en cours")?.entree).toBe(true);
    expect(lireColonne("Sourcing Anaelle")).toMatchObject({ statut: "ouverte", recruteur: "Anaelle", entree: true });
    expect(lireColonne("Sourcing Amadou")).toMatchObject({ statut: "ouverte", recruteur: "Amadou", entree: true });
    expect(lireColonne("Sourcing M CISSE")).toMatchObject({ statut: "ouverte", entree: false });
    expect(lireColonne("Positionnement")?.entree).toBe(false);
    expect(lireColonne("Sourcing Kefi")).toBeNull();
  });
});

describe("Trello : déplacement depuis la vue Kanban", () => {
  it("Sourcing Amadou → mission ouverte, recruteur Amadou", () => {
    expect(champsApresDeplacement("Sourcing Amadou")).toEqual({ trello_colonne: "Sourcing Amadou", statut: "ouverte", trello_recruteur: "Amadou" });
  });
  it("Positionnement → chez le client, recruteur retiré", () => {
    expect(champsApresDeplacement("Positionnement")).toEqual({ trello_colonne: "Positionnement", statut: "chez_client", trello_recruteur: null });
  });
  it("colonne ignorée (Sourcing Kefi) : seule la colonne change, le statut reste", () => {
    expect(champsApresDeplacement("Sourcing Kefi")).toEqual({ trello_colonne: "Sourcing Kefi" });
  });
});

describe("Trello : seule écriture autorisée", () => {
  it("refuse des identifiants qui ne sont pas des identifiants Trello", async () => {
    const { deplacerCarteTrello } = await import("@/lib/trello/client");
    expect(await deplacerCarteTrello("abc", "def")).toMatchObject({ ok: false });
  });
});
