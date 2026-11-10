import { describe, expect, it } from "vitest";
import { formaterTelephone, normaliserTelephone } from "@/lib/metier/telephone";
import { calculerTrigramme } from "@/lib/metier/trigramme";
import { chercherDoublon, normaliserEmail } from "@/lib/metier/dedoublonnage";
import { estimerCoutUSD } from "@/lib/ai/config";

describe("téléphones", () => {
  it.each([
    ["612345678", "+33612345678", "corrige"],
    [612345678, "+33612345678", "corrige"],
    ["612345678.0", "+33612345678", "corrige"],
    ["0612345678", "+33612345678", "valide"],
    ["06 12 34 56 78", "+33612345678", "valide"],
    ["06.12.34.56.78", "+33612345678", "valide"],
    ["+33 6 12 34 56 78", "+33612345678", "valide"],
    ["+33 (0)6 12 34 56 78", "+33612345678", "valide"],
    ["+330612345678", "+33612345678", "corrige"],
    ["0033612345678", "+33612345678", "valide"],
    ["145678901", "+33145678901", "corrige"],
    ["945678901", "+33945678901", "corrige"],
    ["33764847471", "+33764847471", "corrige"],
    ["33 (0)6 23 02 71 65", "+33623027165", "corrige"],
    ["O7 58 90 64 22", "+33758906422", "valide"],
  ])("%s -> %s", (entree, attendu, statut) => {
    const r = normaliserTelephone(entree);
    expect(r.e164).toBe(attendu);
    expect(r.statut).toBe(statut);
  });

  it.each(["812345678", "+44 20 7946 0958", "12345", "06123456789", "abc", "+32 470 12 34 56"])(
    "%s reste brut et est signalé",
    (entree) => {
      const r = normaliserTelephone(entree);
      expect(r.e164).toBeNull();
      expect(r.statut).toBe("invalide");
      expect(r.brut).toBe(entree);
    },
  );

  it("valeur vide", () => {
    expect(normaliserTelephone("").statut).toBe("vide");
    expect(normaliserTelephone(null).statut).toBe("vide");
  });

  it("affichage 06 12 34 56 78", () => {
    expect(formaterTelephone("+33612345678")).toBe("06 12 34 56 78");
    expect(formaterTelephone("+442079460958")).toBe("+442079460958");
    expect(formaterTelephone(null)).toBe("");
  });
});

describe("trigrammes", () => {
  it.each([
    ["Jean", "Dupont", "JDU"],
    ["Éloïse", "Gérard", "EGE"],
    ["Jean-Marc", "Dupont", "JDU"],
    ["Yann", "Le Goff", "YLE"],
    ["Anne", "De La Tour", "ALA"],
    ["Paul", "d'Artagnan", "PAR"],
    ["Marie", "Du Pont", "MPO"],
    ["Ève", "N'Diaye", "END"],
    ["Zoé", "Øster", "ZST"],
  ])("%s %s -> %s", (prenom, nom, attendu) => {
    expect(calculerTrigramme(prenom, nom)).toBe(attendu);
  });

  it("une particule seule reste le nom", () => {
    expect(calculerTrigramme("Luc", "Des")).toBe("LDE");
  });
});

describe("dédoublonnage", () => {
  const existantes = [
    { id: "a", prenom: "Jean", nom: "Dupont", email: "jean.dupont@ex.fr", telephone_e164: "+33612345678" },
    { id: "b", prenom: "Éloïse", nom: "Gérard", email: null, telephone_e164: "+33698765432" },
  ];

  it("normalise l'email", () => {
    expect(normaliserEmail("  Jean.Dupont@EX.fr ")).toBe("jean.dupont@ex.fr");
    expect(normaliserEmail("pas un email")).toBeNull();
    expect(normaliserEmail(null)).toBeNull();
  });

  it("trouve par email d'abord", () => {
    expect(
      chercherDoublon({ prenom: "J", nom: "D", email: "jean.dupont@ex.fr", telephone_e164: null }, existantes),
    ).toEqual({ type: "email", id: "a" });
  });

  it("puis par téléphone", () => {
    expect(
      chercherDoublon({ prenom: "E", nom: "G", email: "autre@ex.fr", telephone_e164: "+33698765432" }, existantes),
    ).toEqual({ type: "telephone", id: "b" });
  });

  it("même nom, coordonnées différentes : doublon possible", () => {
    expect(
      chercherDoublon({ prenom: "Eloise", nom: "GERARD", email: "x@y.fr", telephone_e164: "+33611111111" }, existantes),
    ).toEqual({ type: "possible", ids: ["b"] });
  });

  it("inconnu : aucun doublon", () => {
    expect(
      chercherDoublon({ prenom: "Zoé", nom: "Martin", email: "z@m.fr", telephone_e164: null }, existantes),
    ).toEqual({ type: "aucun" });
  });
});

describe("coût IA", () => {
  it("2 000 CV avec Haiku en lot restent sous 2 $", () => {
    const cout = estimerCoutUSD("claude-haiku-5-5", { entree: 2000 * 6000, sortie: 2000 * 1500 }, "batch");
    expect(cout).toBeCloseTo(1.35, 2);
  });
  it("modèle inconnu refusé", () => {
    expect(() => estimerCoutUSD("claude-opus-5-5", { entree: 1, sortie: 1 })).toThrow();
  });
});
