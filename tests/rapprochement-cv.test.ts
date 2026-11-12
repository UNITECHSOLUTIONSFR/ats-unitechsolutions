import { describe, expect, it } from "vitest";
import { coordonnees, nettoyerIdentite, nomsCompatibles } from "@/lib/sharepoint/rapprochement";

describe("rapprochement des CV SharePoint", () => {
  it("trouve emails et téléphones dans un CV", () => {
    expect(coordonnees("Contact : Jean.Dupont@Exemple.fr — 06 12 34 56 78")).toEqual({ emails: ["jean.dupont@exemple.fr"], telephones: ["+33612345678"] });
  });
  it("nettoie l'identité tirée du nom de fichier", () => {
    expect(nettoyerIdentite("Larbi AIT EL HADJ -Développeur NodeJS")).toEqual({ prenom: "Larbi", nom: "AIT EL HADJ" });
    expect(nettoyerIdentite("Ghassen SAKOUHI anglais")).toEqual({ prenom: "Ghassen", nom: "SAKOUHI" });
    expect(nettoyerIdentite("Consultant ICF")).toBeNull();
  });
  it("noms compatibles malgré l'orthographe, pas entre deux personnes différentes", () => {
    expect(nomsCompatibles("Safwen Marzougi", "Safwen MARZOUGOUI")).toBe(true);
    expect(nomsCompatibles("Joseph GRANCHAMP", "Joseph GRANDCHAMP")).toBe(true);
    expect(nomsCompatibles("Ghilain LECOUTURIER", "Gautier LEFEVRE")).toBe(false);
  });
});

import { lienWhatsApp } from "@/lib/metier/telephone";
describe("WhatsApp", () => {
  it("lien vers le numéro international, message pré-rempli", () => {
    expect(lienWhatsApp("+33612345678", "Marie")).toBe("https://wa.me/33612345678?text=" + encodeURIComponent("Bonjour Marie, je suis du recrutement d'Unitech Solutions."));
    expect(lienWhatsApp("06 12 34 56 78")).toMatch(/^https:\/\/wa\.me\/33612345678\?/);
    expect(lienWhatsApp("abc")).toBeNull();
    expect(lienWhatsApp(null)).toBeNull();
  });
});
