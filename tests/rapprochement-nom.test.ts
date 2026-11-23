import { describe, expect, it } from "vitest";
import { fichesNomSouple } from "@/lib/metier/rapprochement-nom";

const fiches = [
  { id: "a", prenom: "Amine", nom: "AIT OUMAJOUD" },
  { id: "b", prenom: "Jean", nom: "DE LA FONTAINE" },
  { id: "c", prenom: "Marie", nom: "DUPONT" },
  { id: "d", prenom: "Marie", nom: "DUPONT MARTIN" },
];

describe("Rapprochement souple d'un nom de fichier CV", () => {
  it("« Amine OUMAJOUD » retrouve « Amine AIT OUMAJOUD »", () => expect(fichesNomSouple("Amine", "OUMAJOUD", fiches)).toEqual(["a"]));
  it("« Jean FONTAINE » retrouve « Jean DE LA FONTAINE »", () => expect(fichesNomSouple("Jean", "Fontaine", fiches)).toEqual(["b"]));
  it("prénom différent : rien", () => expect(fichesNomSouple("Karim", "OUMAJOUD", fiches)).toEqual([]));
  it("deux fiches possibles : les deux sont renvoyées (pas de rattachement automatique)", () => expect(fichesNomSouple("Marie", "Dupont", fiches).sort()).toEqual(["c", "d"]));
  it("accents et majuscules ignorés", () => expect(fichesNomSouple("amine", "Oumajoud", fiches)).toEqual(["a"]));
});
