import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { detecterColonnes, lireClasseur, preparerImport } from "@/lib/import/excel";

async function classeurDeTest(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Suivi");
  ws.addRow(["Nom", "Prénom", "Téléphone", "E-mail", "Trigramme", "Disponibilité", "Intitulé de poste", "Colonne perso"]);
  ws.addRow(["Dupont", "Jean", 612345678, "Jean.Dupont@Ex.fr ", "JDU", "Immédiate", "Développeur Java", "x"]);
  ws.addRow(["Gérard", "Éloïse", "06 98 76 54 32", "eloise@ex.fr", "", new Date("2027-03-01"), "Cheffe de projet", ""]);
  ws.addRow(["Dupont", "Jean", "", "jean.dupont@ex.fr", "", "", "", ""]); // doublon par email
  ws.addRow(["", "Sans", "0611111111", "", "", "", "", ""]); // pas de nom -> rejet
  ws.addRow(["Smith", "John", "+44 20 7946 0958", "pas-un-email", "JSX", "", "", ""]); // tél étranger, email faux, trigramme différent
  ws.addRow(["Gérard", "Eloise", "0622222222", "autre@ex.fr", "", "", "", ""]); // doublon possible (même nom)
  ws.addRow([{ text: "Le Goff", hyperlink: "https://x" }, "Yann", "", "", "", "", "", ""]);
  ws.addRow([]);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

describe("import Excel", () => {
  it("reconnaît les colonnes usuelles", () => {
    const { correspondance, nonReconnues } = detecterColonnes(["NOM", "Prénom", "Tél.", "Adresse mail", "Fonction", "Divers"]);
    expect(correspondance).toMatchObject({ nom: 0, prenom: 1, telephone: 2, email: 3, intitule_poste: 4 });
    expect(nonReconnues).toEqual(["Divers"]);
  });

  it("lit, normalise, dédoublonne et produit le rapport", async () => {
    const { entetes, lignes } = await lireClasseur(await classeurDeTest());
    const { fiches, rapport } = preparerImport(entetes, lignes);

    expect(rapport.lignesLues).toBe(7);
    expect(rapport.fichesRetenues).toBe(5);
    expect(rapport.rejets).toEqual([{ ligne: 5, raison: "nom manquant" }]);
    expect(rapport.telephonesCorriges).toEqual([{ ligne: 2, avant: "612345678", apres: "+33612345678" }]);
    expect(rapport.telephonesInvalides).toEqual([{ ligne: 6, valeur: "+44 20 7946 0958" }]);
    expect(rapport.emailsInvalides).toEqual([{ ligne: 6, valeur: "pas-un-email" }]);
    expect(rapport.doublonsFusionnes).toEqual([{ lignes: [2, 4], cle: "email:jean.dupont@ex.fr" }]);
    expect(rapport.doublonsPossibles).toEqual([{ lignes: [3, 7], nom: "eloise gerard" }]);
    expect(rapport.trigrammesDifferents).toEqual([{ ligne: 6, excel: "JSX", calcule: "JSM" }]);
    expect(rapport.colonnesNonReconnues).toEqual(["Colonne perso"]);

    const jean = fiches.find((f) => f.nom === "Dupont")!;
    expect(jean).toMatchObject({ email: "jean.dupont@ex.fr", telephone_e164: "+33612345678", trigramme: "JDU", disponibilite: "Immédiate" });
    const eloise = fiches.find((f) => f.email === "eloise@ex.fr")!;
    expect(eloise).toMatchObject({ trigramme: "EGE", disponible_le: "2027-03-01", telephone_e164: "+33698765432" });
    const john = fiches.find((f) => f.nom === "Smith")!;
    expect(john).toMatchObject({ trigramme: "JSX", telephone_e164: null, telephone_brut: "+44 20 7946 0958", email: null });
    expect(fiches.find((f) => f.nom === "Le Goff")!.trigramme).toBe("YLE");
  });

  it("sépare une colonne « NOM Prénom »", () => {
    const { fiches } = preparerImport(["Consultant", "Mail"], [["DUPONT Jean-Marc", "jm@ex.fr"], ["Marie Curie", null]]);
    expect(fiches.map((f) => [f.prenom, f.nom, f.trigramme])).toEqual([
      ["Jean-Marc", "DUPONT", "JDU"],
      ["Marie", "Curie", "MCU"],
    ]);
  });
});
