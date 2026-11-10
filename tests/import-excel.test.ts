import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { lignesHorsExcel } from "@/lib/tableau/hors-excel";
import { filtrerEtTrier, type LigneTableau } from "@/lib/tableau/modele";
import { analyserCaseEmail, fusionnerOnglets, corrigerOngletPrincipal, detecterColonnes, lireClasseur, preparerImport } from "@/lib/import/excel";

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
    expect(rapport.fichesRetenues).toBe(6);
    expect(rapport.rejets).toEqual([{ ligne: 5, raison: "nom manquant (importée avec alerte)", valeurs: { "Prénom": "Sans", "Téléphone": "0611111111" } }]);
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
    // Rien n'est perdu : colonne inconnue et lignes fusionnées conservées
    expect(jean.donnees_excel.map((d) => d.ligne)).toEqual([2, 4]);
    expect(jean.donnees_excel[0].valeurs["Colonne perso"]).toBe("x");
  });

  it("sépare une colonne « NOM Prénom »", () => {
    const { fiches } = preparerImport(["Consultant", "Mail"], [["DUPONT Jean-Marc", "jm@ex.fr"], ["Marie Curie", null]]);
    expect(fiches.map((f) => [f.prenom, f.nom, f.trigramme])).toEqual([
      ["Jean-Marc", "DUPONT", "JDU"],
      ["Marie", "Curie", "MCU"],
    ]);
  });

  it("reconnaît « Prénoms », TJM, LinkedIn, Expérience, CV", () => {
    const { correspondance } = detecterColonnes(["Nom", "Prénoms", "TJM / Salaire", "Linkedin", "Expérience", "CV", "Date de mise à jour"]);
    expect(correspondance).toMatchObject({ nom: 0, prenom: 1, tjm_salaire: 2, linkedin: 3, experience: 4, cv_lien: 5, date_maj: 6 });
  });

  it.each([
    ["jean.dupontÂgmail.com", { email: "jean.dupont@gmail.com", email2: null, linkedin: null, commentaire: null }],
    ["a@x.fr / b@y.fr", { email: "a@x.fr", email2: "b@y.fr", linkedin: null, commentaire: null }],
    ["a@x.fr linkedin.com/in/jdupont", { email: "a@x.fr", email2: null, linkedin: "linkedin.com/in/jdupont", commentaire: null }],
    ["Voir LinkedIn", { email: null, email2: null, linkedin: "Voir LinkedIn", commentaire: null }],
    ["pas de mail, rappeler", { email: null, email2: null, linkedin: null, commentaire: "pas de mail, rappeler" }],
  ])("case email « %s »", (brut, attendu) => {
    expect(analyserCaseEmail(brut)).toEqual(attendu);
  });

  it("corrige l'onglet principal et ajoute les colonnes nécessaires", () => {
    const o = corrigerOngletPrincipal({
      nom: "Suivi", entetes: ["Nom", "Email", "Linkedin"], numeros: [2, 3, 4],
      lignes: [["A", "a@x.fr", null], ["B", "bÂx.fr ; c@y.fr", null], ["C", "à rappeler", "lien"]],
    });
    expect(o.entetes).toEqual(["Nom", "Email", "Linkedin", "Email 2", "Commentaire email"]);
    expect(o.lignes[0]).toEqual(["A", "a@x.fr", null, null, null]);
    expect(o.lignes[1]).toEqual(["B", "b@x.fr", null, "c@y.fr", null]);
    expect(o.lignes[2]).toEqual(["C", null, "lien", null, "à rappeler"]);
  });

  it("fusionne les onglets métier dans la colonne Domaine, sans rien perdre", () => {
    const E = ["Prénoms", "Nom", "Email", "Téléphone"];
    const { onglet, lignesAjoutees, lignesRetrouvees } = fusionnerOnglets([
      { nom: "Principal", entetes: E, numeros: [2, 3], lignes: [["Jean", "Dupont", "j@x.fr", "0611111111"], ["Ana", "Roux", null, "0622222222"]] },
      { nom: "Dev", entetes: E, numeros: [2, 3], lignes: [["Jean", "Dupont", "j@x.fr", null], ["Zoé", "Neuve", "z@x.fr", null]] },
      { nom: "Data", entetes: [...E, "Autre"], numeros: [2], lignes: [["ana", "ROUX", null, "06 22 22 22 22", "x"]] },
    ]);
    expect(onglet.entetes).toEqual([...E, "Domaine"]);
    expect(onglet.lignes.map((l) => [l[1], l[4]])).toEqual([["Dupont", "Dev"], ["Roux", "Data"], ["Neuve", "Dev"]]);
    expect([lignesAjoutees, lignesRetrouvees]).toEqual([1, 2]);
    expect(onglet.numeros).toEqual([2, 3, 4]);
  });

  it("présente une fiche créée par email comme une ligne du tableau", () => {
    const [l] = lignesHorsExcel([{
      id: "c1", source: "email", prenom: "Ana", nom: "Roux", trigramme: "ARO", email: "ana@x.fr", email_2: null, telephone_e164: "+33612345678",
      telephone_brut: null, intitule_poste: "Dev", disponibilite: null, disponible_le: null, disponibilite_maj_le: null, localisation: "Paris",
      notes: null, statut: "candidat", experience: null, tjm_salaire: null, linkedin: null, cv_lien: null, commentaire_email: null,
    }], ["Prénoms", "Nom", "Trigramme", "Email", "Téléphone", "Métier", "Statut", "Domaine"], 4019);
    expect(l).toMatchObject({ id: "fiche:c1", position: 4019, consultant_id: "c1" });
    expect(l.valeurs).toEqual({ "Prénoms": "Ana", Nom: "Roux", Trigramme: "ARO", Email: "ana@x.fr", "Téléphone": "06 12 34 56 78", "Métier": "Dev", Statut: "candidat", Domaine: "Ajoutés par email" });
  });

  it("recherche sur toutes les colonnes, sans accents, et numéros dans tous les formats", () => {
    const lignes: LigneTableau[] = [
      { id: "1", position: 2, consultant_id: null, valeurs: { "Prénoms": "Éloïse", Nom: "Gérard", "Téléphone": "06 12 34 56 78", Notes: "Expert SAP" } },
      { id: "2", position: 3, consultant_id: null, valeurs: { "Prénoms": "Jean", Nom: "Dupont", "Téléphone": "0698765432" } },
    ];
    const ids = (q: string) => filtrerEtTrier(lignes, {}, q, null).map((l) => l.id);
    expect(ids("eloise")).toEqual(["1"]);
    expect(ids("sap")).toEqual(["1"]);
    expect(ids("0612345678")).toEqual(["1"]);
    expect(ids("06 98 76")).toEqual(["2"]);
    expect(ids("jean dupont")).toEqual(["2"]);
    expect(filtrerEtTrier(lignes, {}, "", { colonne: "Prénoms", sens: "asc" }).map((l) => l.id)).toEqual(["1", "2"]);
  });
});

describe("recherche dans le texte des CV", () => {
  it("une ligne trouvée dans le CV est retenue même sans le mot dans les colonnes", () => {
    const lignes: LigneTableau[] = [
      { id: "1", position: 2, consultant_id: "c1", valeurs: { Nom: "Gérard" } },
      { id: "2", position: 3, consultant_id: "c2", valeurs: { Nom: "Dupont" } },
    ];
    expect(filtrerEtTrier(lignes, {}, "kafka", null, undefined, new Set(["c2"])).map((l) => l.id)).toEqual(["2"]);
  });
});

describe("filtres rapides", () => {
  const maintenant = Date.parse("2026-11-10T12:00:00Z");
  const l = (meta: LigneTableau["meta"]): LigneTableau => ({ id: "x", position: 1, consultant_id: "c", valeurs: {}, meta });
  it("disponibles maintenant, à vérifier, ajoutés cette semaine, CV analysé", async () => {
    const { filtreRapide } = await import("@/lib/tableau/modele");
    expect(filtreRapide(l({ dispo: "Immédiate" }), "disponibles", maintenant)).toBe(true);
    expect(filtreRapide(l({ dispoLe: "2026-11-01" }), "disponibles", maintenant)).toBe(true);
    expect(filtreRapide(l({ dispoLe: "2027-01-01" }), "disponibles", maintenant)).toBe(false);
    expect(filtreRapide(l({ dispoMaj: "2026-06-01T00:00:00Z" }), "a_verifier", maintenant)).toBe(true);
    expect(filtreRapide(l({ dispoMaj: "2026-11-01T00:00:00Z" }), "a_verifier", maintenant)).toBe(false);
    expect(filtreRapide(l({ creeLe: "2026-11-08T00:00:00Z" }), "semaine", maintenant)).toBe(true);
    expect(filtreRapide(l({ cvAnalyse: true }), "cv", maintenant)).toBe(true);
    expect(filtreRapide({ id: "y", position: 2, consultant_id: null, valeurs: {} }, "cv", maintenant)).toBe(false);
  });
});
