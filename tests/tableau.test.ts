import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { champsParEntete, entetesUniques, lireOnglets, valeurAffichee } from "@/lib/import/excel";
import { cleStable, comparer, filtrerEtTrier, majFicheDepuisCellule, valeurEcran, valeursDistinctes, VIDE, type LigneTableau } from "@/lib/tableau/modele";

describe("lecture de tous les onglets", () => {
  it("garde chaque onglet, ses en-têtes dans l'ordre et ses lignes", async () => {
    const wb = new ExcelJS.Workbook();
    const a = wb.addWorksheet("Consultants");
    a.addRow(["Nom", "Prénoms", "Téléphone", "", "Statut"]);
    a.addRow(["Dupont", "Jean", 612345678, "", "Dispo"]);
    a.addRow([]);
    a.addRow(["Martin", "Léa", "", "", new Date(Date.UTC(2027, 2, 1))]);
    const b = wb.addWorksheet("Clients");
    b.addRow(["Client", "Contact", "Contact"]);
    b.addRow(["ACME", "Paul", "Marie"]);
    wb.addWorksheet("Vide");
    const onglets = await lireOnglets((await wb.xlsx.writeBuffer()) as ArrayBuffer);

    expect(onglets.map((o) => o.nom)).toEqual(["Consultants", "Clients", "Vide"]);
    expect(onglets[0].entetes).toEqual(["Nom", "Prénoms", "Téléphone", "", "Statut"]);
    expect(onglets[0].numeros).toEqual([2, 4]);
    expect(valeurAffichee(onglets[0].lignes[1][4])).toBe("01/03/2027");
    expect(entetesUniques(onglets[0].entetes)).toEqual(["Nom", "Prénoms", "Téléphone", "Colonne 4", "Statut"]);
    expect(entetesUniques(onglets[1].entetes)).toEqual(["Client", "Contact", "Contact (2)"]);
    expect(onglets[2]).toMatchObject({ entetes: [], lignes: [] });
  });
});

describe("tableau de suivi", () => {
  const lignes: LigneTableau[] = [
    { id: "a", position: 2, consultant_id: "c1", valeurs: { Nom: "Dupont", Prénoms: "Jean", Téléphone: "612345678", Dispo: "15/01/2027" } },
    { id: "b", position: 3, consultant_id: null, valeurs: { Nom: "Éléonore", Prénoms: "Anne", Dispo: "01/12/2026" } },
    { id: "c", position: 4, consultant_id: "c3", valeurs: { Nom: "martin", Téléphone: "0698765432" } },
  ];
  const champs = champsParEntete(["Nom", "Prénoms", "Téléphone", "Dispo"], ["Nom", "Prénoms", "Téléphone", "Dispo"]);
  const affiche = (c: string, v: string | undefined) => valeurEcran(champs[c], v);

  it("relie les en-têtes aux champs de la fiche", () => {
    expect(champs).toEqual({ Nom: "nom", Prénoms: "prenom", Téléphone: "telephone", Dispo: "disponibilite" });
  });

  it("affiche les téléphones avec le zéro rétabli", () => {
    expect(affiche("Téléphone", "612345678")).toBe("06 12 34 56 78");
    expect(affiche("Nom", "612345678")).toBe("612345678");
  });

  it("filtre par valeurs cochées (y compris les vides), recherche sans accents, trie dates et texte", () => {
    expect(filtrerEtTrier(lignes, { Prénoms: [VIDE] }, "", null, affiche).map((l) => l.id)).toEqual(["c"]);
    expect(filtrerEtTrier(lignes, {}, "eleonore", null, affiche).map((l) => l.id)).toEqual(["b"]);
    expect(filtrerEtTrier(lignes, {}, "06 98", null, affiche).map((l) => l.id)).toEqual(["c"]);
    expect(filtrerEtTrier(lignes, {}, "", { colonne: "Dispo", sens: "asc" }, affiche).map((l) => l.id)).toEqual(["b", "a", "c"]);
    expect(filtrerEtTrier(lignes, {}, "", { colonne: "Nom", sens: "asc" }, affiche).map((l) => l.id)).toEqual(["a", "b", "c"]);
    expect(valeursDistinctes(lignes, "Prénoms", affiche)).toEqual([
      { valeur: "Anne", nombre: 1 }, { valeur: "Jean", nombre: 1 }, { valeur: VIDE, nombre: 1 },
    ]);
    expect(comparer("10", "9")).toBeGreaterThan(0);
  });

  it("une modification de cellule met à jour le bon champ de la fiche", () => {
    expect(majFicheDepuisCellule("telephone", "612345678")).toEqual({ telephone_e164: "+33612345678", telephone_brut: null });
    expect(majFicheDepuisCellule("email", " Jean@Ex.FR ")).toEqual({ email: "jean@ex.fr" });
    expect(majFicheDepuisCellule("disponibilite", "01/12/2026")).toMatchObject({ disponible_le: "2026-12-01", disponibilite: null });
    expect(majFicheDepuisCellule("disponibilite", "Immédiate")).toMatchObject({ disponible_le: null, disponibilite: "Immédiate" });
    expect(majFicheDepuisCellule("statut", "En mission")).toEqual({ statut: "en_mission" });
    expect(majFicheDepuisCellule("nom", "")).toBeNull();
    expect(majFicheDepuisCellule("date_maj", "01/01/2026")).toBeNull();
  });

  it("la clé de liaison ligne ↔ fiche ne dépend pas de l'ordre des colonnes", () => {
    expect(cleStable(2, { a: "1", b: "2" })).toBe(cleStable(2, { b: "2", a: "1" }));
    expect(cleStable(2, { a: "1" })).not.toBe(cleStable(3, { a: "1" }));
  });
});
