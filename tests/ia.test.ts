/* eslint-disable @typescript-eslint/no-explicit-any -- inspection libre des paramètres envoyés à l API */
import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { lireJSON, parametresExtraction, requeteLotProfilCV, tronquer, usageDepuisReponse } from "@/lib/ai";
import { CONSIGNES_MISSION, CONSIGNES_PROFIL_CV } from "@/lib/ai/consignes";
import { MODELES } from "@/lib/ai/config";
import { SchemaExigencesMission, SchemaProfilCV, ficheCVValide } from "@/lib/ai/schemas";

const message = (texte: string, stop: Anthropic.Message["stop_reason"] = "end_turn") =>
  ({ content: [{ type: "text", text: texte }], stop_reason: stop, usage: {} }) as unknown as Anthropic.Message;

describe("module IA (sans appel réseau)", () => {
  it("aucun modèle interdit dans la configuration", () => {
    for (const m of Object.values(MODELES)) expect(m).toMatch(/^claude-(haiku|sonnet)-5-5$/);
  });

  it("Haiku : réflexion désactivée, consignes en cache, JSON strict, max_tokens serré", () => {
    const p = requeteLotProfilCV("doc-1", "CV de test").params as unknown as Record<string, any>;
    expect(p.model).toBe("claude-haiku-5-5");
    expect(p.thinking).toEqual({ type: "disabled" });
    expect(p.output_config.effort).toBe("low");
    expect(p.output_config.format.type).toBe("json_schema");
    expect(p.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(p.max_tokens).toBe(1500);
  });

  it("Sonnet : mode « between_tools » (Sonnet 5.5 refuse « disabled »)", () => {
    const p = parametresExtraction("claude-sonnet-5-5", CONSIGNES_MISSION, SchemaExigencesMission, "x", 600) as unknown as Record<string, any>;
    expect(p.thinking).toEqual({ type: "between_tools" });
  });

  it("texte tronqué à 30 000 caractères", () => {
    expect(tronquer("a".repeat(40_000))).toHaveLength(30_000);
  });

  it("les consignes interdisent les caractéristiques protégées et dépassent le seuil de cache", () => {
    for (const c of [CONSIGNES_PROFIL_CV, CONSIGNES_MISSION]) {
      expect(c).toMatch(/âge/);
      expect(c).toMatch(/nationalité/);
      expect(c).toMatch(/handicap/);
      expect(c.length / 4).toBeGreaterThan(512); // ~4 caractères par token
    }
  });

  it("lecture et validation de la réponse JSON", () => {
    const fiche = {
      prenom: "Jean", nom: "Dupont", email: null, telephone: null, intitule_poste: "Développeur Java",
      localisation: "Paris", annees_experience: 8, seniorite: "senior",
      competences: [{ nom: "Java", annees: 8, niveau: 5 }], secteurs: ["Banque"],
      langues: [{ langue: "Anglais", niveau: "B2" }], certifications: [], resume: "Développeur Java.",
    };
    const lu = lireJSON(message(JSON.stringify(fiche)), SchemaProfilCV)!;
    expect(lu.competences[0].nom).toBe("Java");
    expect(ficheCVValide(lu)).toBe(true);
    expect(ficheCVValide({ ...lu, competences: [] })).toBe(false);
    expect(lireJSON(message("pas du json"), SchemaProfilCV)).toBeNull();
    expect(lireJSON(message(JSON.stringify(fiche), "max_tokens"), SchemaProfilCV)).toBeNull();
    expect(lireJSON(message(JSON.stringify({ ...fiche, seniorite: "stagiaire" })), SchemaProfilCV)).toBeNull();
  });

  it("calcul du coût d'un appel", () => {
    const u = usageDepuisReponse(
      { input_tokens: 6000, output_tokens: 1500, cache_read_input_tokens: 700, cache_creation_input_tokens: 0 } as Anthropic.Usage,
      "claude-haiku-5-5", "fiche_cv", "batch",
    );
    expect(u.cout_estime_usd).toBeCloseTo((6000 * 0.1 + 1500 * 0.5 + 700 * 0.01) / 1e6 / 2, 10);
  });
});
