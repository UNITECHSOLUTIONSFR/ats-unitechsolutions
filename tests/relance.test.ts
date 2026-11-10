import { describe, expect, it } from "vitest";
import { miseAJourDepuisReponse, rendreMessage, texteDeLaReponse, versHTML } from "@/lib/relance/modele";

const maintenant = new Date("2026-11-10T10:00:00Z");

describe("relance des disponibilités", () => {
  it("personnalise le message et ajoute toujours la désinscription", () => {
    const m = rendreMessage("Bonjour {prenom},\nça va ?", { prenom: "Ana", nom: "Roux" }, "https://x/desinscription/abc");
    expect(m).toMatch(/^Bonjour Ana,/);
    expect(m).toContain("Pour ne plus être contacté : https://x/desinscription/abc");
    expect(rendreMessage("Bonjour {prenom},", { prenom: "—", nom: "X" }, "l")).toMatch(/^Bonjour,/);
    expect(versHTML("a <b>\n\nhttps://x/y")).toBe('<p>a &lt;b&gt;</p>\n<p><a href="https://x/y">https://x/y</a></p>');
  });

  it("ne garde que ce que le consultant a écrit", () => {
    expect(texteDeLaReponse("Dispo début janvier.\nCordialement\n\nLe lun. 10 nov. 2026 à 10:00, Unitech a écrit :\n> Bonjour")).toBe("Dispo début janvier.\nCordialement");
    expect(texteDeLaReponse("Oui dispo\n\nDe : Unitech\nEnvoyé : lundi")).toBe("Oui dispo");
  });

  it("met à jour la fiche automatiquement selon la réponse", () => {
    expect(miseAJourDepuisReponse({ situation: "disponible_a_partir", disponible_le: "2027-01-15", texte_disponibilite: "x", confiance: 0.9 }, maintenant))
      .toMatchObject({ statutEnvoi: "repondu", texte: "Disponible le 15/01/2027", fiche: { disponible_le: "2027-01-15", disponibilite_maj_le: maintenant.toISOString() } });
    expect(miseAJourDepuisReponse({ situation: "disponible", disponible_le: null, texte_disponibilite: null, confiance: 0.95 }, maintenant).texte).toBe("Disponible immédiatement");
    // Date passée = disponible maintenant
    expect(miseAJourDepuisReponse({ situation: "disponible_a_partir", disponible_le: "2026-10-01", texte_disponibilite: null, confiance: 0.9 }, maintenant).texte).toBe("Disponible immédiatement");
    expect(miseAJourDepuisReponse({ situation: "en_mission", disponible_le: null, texte_disponibilite: "En mission, fin non connue", confiance: 0.8 }, maintenant))
      .toMatchObject({ texte: "En mission, fin non connue", fiche: { disponible_le: null } });
  });

  it("désinscrit sur demande, et ne touche à rien en cas de doute", () => {
    expect(miseAJourDepuisReponse({ situation: "plus_interesse", disponible_le: null, texte_disponibilite: null, confiance: 0.9 }, maintenant))
      .toMatchObject({ statutEnvoi: "desinscrit", fiche: { ne_plus_contacter: true } });
    expect(miseAJourDepuisReponse({ situation: "pas_une_reponse", disponible_le: null, texte_disponibilite: null, confiance: 0.9 }, maintenant))
      .toEqual({ fiche: null, statutEnvoi: "a_verifier", texte: null });
    expect(miseAJourDepuisReponse({ situation: "disponible", disponible_le: null, texte_disponibilite: null, confiance: 0.3 }, maintenant).fiche).toBeNull();
  });
});

describe("module Email : choix des destinataires", () => {
  const maintenant = Date.parse("2026-11-10T12:00:00Z");
  const c = (id: string, o: Partial<import("@/lib/relance/modele").CandidatEnvoi>) => ({ id, statut: "candidat", intitule_poste: null, disponibilite: null, disponible_le: null, disponibilite_maj_le: null, ...o });
  const liste = [
    c("a", { intitule_poste: "Développeur Java", disponibilite_maj_le: "2026-01-01T00:00:00Z" }),
    c("b", { intitule_poste: "Chef de projet", statut: "consultant", disponibilite: "Immédiate", disponibilite_maj_le: "2026-11-01T00:00:00Z" }),
    c("c", { intitule_poste: "Data engineer", disponible_le: "2026-12-15" }),
  ];
  it("filtre par fonction ou compétence, sans accents", async () => {
    const { filtrerDestinataires } = await import("@/lib/relance/modele");
    expect(filtrerDestinataires(liste, new Map([["c", "Kafka · Spark"]]), { fonction: "kafka" }, maintenant).map((x) => x.id)).toEqual(["c"]);
    expect(filtrerDestinataires(liste, new Map(), { fonction: "développeur java" }, maintenant).map((x) => x.id)).toEqual(["a"]);
  });
  it("filtre par statut, disponibilité ancienne, disponible avant une date, et exclusions", async () => {
    const { filtrerDestinataires } = await import("@/lib/relance/modele");
    expect(filtrerDestinataires(liste, new Map(), { statuts: ["consultant"] }, maintenant).map((x) => x.id)).toEqual(["b"]);
    expect(filtrerDestinataires(liste, new Map(), { dispoPlusVieilleQueJours: 90 }, maintenant).map((x) => x.id)).toEqual(["a", "c"]);
    expect(filtrerDestinataires(liste, new Map(), { disponibleAvant: "2026-12-31" }, maintenant).map((x) => x.id)).toEqual(["b", "c"]);
    expect(filtrerDestinataires(liste, new Map(), { exclus: ["a", "b"] }, maintenant).map((x) => x.id)).toEqual(["c"]);
  });
});
