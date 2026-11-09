import { beforeEach, describe, expect, it } from "vitest";
import JSZip from "jszip";
import { analyserNomFichier, separerPrenomNom } from "@/lib/sharepoint/noms";
import { associer, type DocAssociable } from "@/lib/sharepoint/association";
import { construireVecteurs, cosinus } from "@/lib/sharepoint/similarite";
import { empreinteSHA256, extraireTexte } from "@/lib/sharepoint/extraction";
import { listerFichiersCV, lireDelta, obtenirJeton } from "@/lib/sharepoint/graph";

// ---------- Noms de fichiers ----------
describe("analyse des noms de fichiers", () => {
  it.each([
    ["Unitech Solution, Jean Dupont, Développeur Java.docx", "Jean", "Dupont", "JDU", "Développeur Java"],
    ["Unitech Solution, Jean-Marc Le Goff, Chef de projet.docx", "Jean-Marc", "Le Goff", "JLE", "Chef de projet"],
    ["Unitech Solution, Éloïse Gérard, Data Analyst.docx", "Éloïse", "Gérard", "EGE", "Data Analyst"],
    ["Unitech Solution, Marie DE LA TOUR, PMO.docx", "Marie", "DE LA TOUR", "MLA", "PMO"],
    ["Unitech Solutions,  Paul Martin , Architecte, Cloud.docx", "Paul", "Martin", "PMA", "Architecte, Cloud"],
  ])("%s", (nom, prenom, nomFamille, tri, fonction) => {
    const a = analyserNomFichier(nom);
    expect(a).toMatchObject({ type: "word_nominatif", prenom, nom: nomFamille, trigramme: tri, fonction, conforme: true });
  });

  it.each([
    ["Unitech Solution, JDU, Développeur Java.pdf", "JDU", "Développeur Java"],
    ["Unitech Solution, jle, Chef de projet.pdf", "JLE", "Chef de projet"],
  ])("PDF anonymisé %s", (nom, tri, fonction) => {
    expect(analyserNomFichier(nom)).toMatchObject({ type: "pdf_anonyme", trigramme: tri, fonction, conforme: true });
  });

  it("nom hors convention signalé", () => {
    expect(analyserNomFichier("CV_scan_2021.pdf").conforme).toBe(false);
    expect(analyserNomFichier("Photo.jpg").type).toBe("autre");
  });

  it("NOM en majuscules en premier", () => {
    expect(separerPrenomNom("DUPONT Jean")).toEqual({ prenom: "Jean", nom: "DUPONT" });
  });
});

// ---------- Similarité et association ----------
const cvA = "Expérience Société Générale 2019 2023 développeur Java Spring Boot Kafka microservices. Formation EPITA ingénieur 2018. Compétences Docker Kubernetes Jenkins. ".repeat(3);
const cvB = "Consultant SAP FI CO chez Airbus Toulouse 2015 2022. Formation Toulouse Business School. Comptabilité analytique, migration S/4HANA, paie. ".repeat(3);
const cvC = "Chef de projet infrastructure réseau Orange Business 2012 2020, Cisco, ITIL, gestion budget équipe de 12 personnes, ERP, PMP. ".repeat(3);

function doc(id: string, nom: string, texte: string | null, metier = "Dev"): DocAssociable {
  const a = analyserNomFichier(nom);
  return { id, nomFichier: nom, trigramme: a.trigramme, fonction: a.fonction, metier, texte };
}

describe("similarité locale", () => {
  it("même CV (avec ou sans nom) très proche, CV différents éloignés", () => {
    const v = construireVecteurs(new Map([["w", "Jean Dupont " + cvA], ["p", "JDU " + cvA], ["x", cvB], ["y", cvC]]));
    expect(cosinus(v.get("w"), v.get("p"))).toBeGreaterThan(0.8);
    expect(cosinus(v.get("w"), v.get("x"))).toBeLessThan(0.2);
  });
});

describe("association Word ↔ PDF", () => {
  it("un seul candidat au trigramme : association directe", () => {
    const r = associer([doc("w1", "Unitech Solution, Jean Dupont, Dev.docx", cvA)], [doc("p1", "Unitech Solution, JDU, Dev.pdf", cvA), doc("p2", "Unitech Solution, ABC, Dev.pdf", cvB)]);
    expect(r[0]).toMatchObject({ pdfId: "p1", statut: "associe_auto", methode: "trigramme_unique" });
  });

  it("plusieurs candidats : le texte tranche", () => {
    const r = associer(
      [doc("w1", "Unitech Solution, Jean Dupont, Dev.docx", cvA)],
      [doc("p1", "Unitech Solution, JDU, Dev.pdf", cvB), doc("p2", "Unitech Solution, JDU, Dev.pdf", cvA), doc("p3", "Unitech Solution, ZZZ, Dev.pdf", cvC)],
    );
    expect(r[0]).toMatchObject({ pdfId: "p2", statut: "associe_auto", methode: "similarite_texte" });
  });

  it("plusieurs candidats sans texte : la fonction tranche si une seule correspond", () => {
    const r = associer(
      [doc("w1", "Unitech Solution, Jean Dupont, Chef de projet.docx", null)],
      [doc("p1", "Unitech Solution, JDU, Développeur.pdf", null), doc("p2", "Unitech Solution, JDU, Chef de projet.pdf", null)],
    );
    expect(r[0]).toMatchObject({ pdfId: "p2", methode: "trigramme_fonction" });
  });

  it("plusieurs candidats indiscernables : douteux, rien n'est associé", () => {
    const r = associer(
      [doc("w1", "Unitech Solution, Jean Dupont, Dev.docx", null)],
      [doc("p1", "Unitech Solution, JDU, Dev.pdf", null), doc("p2", "Unitech Solution, JDU, Dev.pdf", null)],
    );
    expect(r[0]).toMatchObject({ pdfId: null, statut: "douteux", methode: "ambigu" });
  });

  it("aucun PDF au trigramme : sans correspondance, ou suggestion si le texte est presque identique", () => {
    const r = associer(
      [doc("w1", "Unitech Solution, Jean Dupont, Dev.docx", cvA), doc("w2", "Unitech Solution, Paul Martin, Dev.docx", cvC)],
      [doc("p1", "Unitech Solution, JED, Dev.pdf", cvA), doc("p2", "Unitech Solution, ABC, SAP.pdf", cvB)],
    );
    expect(r[0]).toMatchObject({ pdfId: null, suggestionPdfId: "p1", statut: "douteux" });
    expect(r[1]).toMatchObject({ pdfId: null, statut: "sans_correspondance" });
  });

  it("candidat unique mais contenu sans rapport : douteux (garde-fou)", () => {
    const r = associer([doc("w1", "Unitech Solution, Jean Dupont, Dev.docx", cvA)], [doc("p1", "Unitech Solution, JDU, SAP.pdf", cvB), doc("p2", "Unitech Solution, XYZ, x.pdf", cvC)]);
    expect(r[0]).toMatchObject({ pdfId: null, suggestionPdfId: "p1", statut: "douteux" });
  });

  it("un même PDF ne va jamais à deux Word", () => {
    const r = associer(
      [doc("w1", "Unitech Solution, Jean Dupont, Dev.docx", null), doc("w2", "Unitech Solution, Julie Dumas, Dev.docx", null)],
      [doc("p1", "Unitech Solution, JDU, Dev.pdf", null)],
    );
    expect(r.filter((x) => x.pdfId === "p1").length).toBe(0);
    expect(r.every((x) => x.statut === "douteux" && x.methode === "conflit_pdf")).toBe(true);
  });
});

// ---------- Extraction ----------
async function docxMinimal(texte: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/document.xml", `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${texte}</w:t></w:r></w:p></w:body></w:document>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

function pdfMinimal(texte: string): Buffer {
  const lignes = texte.match(/.{1,60}/g) ?? [""];
  const contenu = `BT /F1 10 Tf 14 TL 50 750 Td ${lignes.map((l) => `(${l}) '`).join(" ")} ET`;
  const objets = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${contenu.length} >>\nstream\n${contenu}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let sortie = "%PDF-1.4\n";
  const positions: number[] = [];
  objets.forEach((o, i) => { positions.push(sortie.length); sortie += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = sortie.length;
  sortie += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n` + positions.map((p) => `${String(p).padStart(10, "0")} 00000 n \n`).join("");
  sortie += `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(sortie, "latin1");
}

describe("extraction locale du texte", () => {
  const long = "Developpeur Java Spring Kafka experience bancaire ".repeat(6);
  it("lit un .docx", async () => {
    const r = await extraireTexte(await docxMinimal(long), "cv.docx");
    expect(r.texte).toContain("Developpeur Java");
    expect(r.extractible).toBe(true);
  });
  it("lit un .pdf", async () => {
    const r = await extraireTexte(pdfMinimal(long), "cv.pdf");
    expect(r.texte).toContain("Developpeur Java");
    expect(r.extractible).toBe(true);
  });
  it("texte trop court (scan) = non extractible ; fichier corrompu = erreur sans plantage", async () => {
    expect((await extraireTexte(pdfMinimal("x"), "scan.pdf")).extractible).toBe(false);
    const r = await extraireTexte(Buffer.from("pas un docx"), "x.docx");
    expect(r.extractible).toBe(false);
    expect(r.erreur).toBeTruthy();
  });
  it("empreinte SHA-256 stable", () => {
    expect(empreinteSHA256(Buffer.from("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

// ---------- Microsoft Graph (simulé) ----------
describe("lecture Graph (simulée, lecture seule)", () => {
  const appels: { url: string; init?: RequestInit }[] = [];
  const reponse = (corps: unknown) => new Response(JSON.stringify(corps), { status: 200 });
  const faux: typeof fetch = async (entree, init) => {
    const url = String(entree);
    appels.push({ url, init });
    expect(init?.method ?? "GET").toMatch(/GET|POST/);
    if (url.includes("oauth2")) return reponse({ access_token: "jeton-test", expires_in: 3600 });
    if (url.includes("CV%20Consultants:/children")) return reponse({ value: [{ id: "d1", name: "Développeur", folder: {} }, { id: "f0", name: "Lisez-moi.docx", file: {} }] });
    if (url.includes("CV%20Consultants/D%C3%A9veloppeur:/children") && !url.includes("skip"))
      return reponse({ value: [{ id: "f1", name: "a.docx", file: {} }], "@odata.nextLink": "https://graph.microsoft.com/v1.0/next?skip=1" });
    if (url.includes("skip=1")) return reponse({ value: [{ id: "f2", name: "a.pdf", file: {} }] });
    if (url.includes("/delta")) return reponse({ value: [{ id: "f3", name: "b.pdf", file: {} }], "@odata.deltaLink": "https://graph.microsoft.com/v1.0/delta?token=42" });
    return new Response("inconnu", { status: 404 });
  };
  beforeEach(() => { process.env.MS_CLIENT_SECRET = "secret-de-test"; appels.length = 0; });

  it("jeton : identifiants dans le corps, pas d'en-tête Basic", async () => {
    await obtenirJeton(faux);
    const a = appels.find((x) => x.url.includes("oauth2"));
    if (a) {
      expect(String(a.init?.body)).toContain("client_id=598431b6");
      expect(String(a.init?.body)).toContain("grant_type=client_credentials");
      expect(JSON.stringify(a.init?.headers)).not.toContain("Basic");
    }
  });

  it("parcourt les sous-dossiers métier avec pagination", async () => {
    const f = await listerFichiersCV("drive1", faux);
    expect(f.map((x) => [x.name, x.metier])).toEqual([["Lisez-moi.docx", null], ["a.docx", "Développeur"], ["a.pdf", "Développeur"]]);
    expect(appels.every((a) => (a.init?.method ?? "GET") !== "PUT" && (a.init?.method ?? "GET") !== "DELETE")).toBe(true);
  });

  it("delta : renvoie les changements et le lien pour la nuit suivante", async () => {
    const d = await lireDelta("drive1", null, faux);
    expect(d.elements[0].id).toBe("f3");
    expect(d.lienDelta).toContain("token=42");
  });
});
