import { z } from "zod";

/** Version des consignes : à incrémenter dès qu'une consigne ou un schéma change (=> retraitement). */
export const PROMPT_VERSION = "2026-11-06.1";

const SENIORITES = ["junior", "confirme", "senior", "expert"] as const;

export const SchemaProfilCV = z.object({
  prenom: z.string().nullable(),
  nom: z.string().nullable(),
  email: z.string().nullable(),
  telephone: z.string().nullable(),
  intitule_poste: z.string().nullable(),
  localisation: z.string().nullable(),
  annees_experience: z.number().nullable(),
  seniorite: z.enum(SENIORITES).nullable(),
  competences: z.array(
    z.object({
      nom: z.string(),
      annees: z.number().nullable(),
      niveau: z.number().int().nullable(), // 1 (notions) à 5 (expert)
    }),
  ),
  secteurs: z.array(z.string()),
  langues: z.array(z.object({ langue: z.string(), niveau: z.string().nullable() })),
  certifications: z.array(z.string()),
  resume: z.string(),
});
export type ProfilCV = z.infer<typeof SchemaProfilCV>;

export const SchemaExigencesMission = z.object({
  intitule: z.string(),
  client: z.string().nullable(),
  localisation: z.string().nullable(),
  date_debut: z.string().nullable(), // AAAA-MM-JJ
  duree: z.string().nullable(),
  annees_min: z.number().nullable(),
  seniorite: z.enum(SENIORITES).nullable(),
  competences: z.array(
    z.object({
      nom: z.string(),
      obligatoire: z.boolean(),
      importance: z.number().int(), // 1 (utile) à 3 (essentielle)
      annees_min: z.number().nullable(),
    }),
  ),
  resume: z.string(),
});
export type ExigencesMission = z.infer<typeof SchemaExigencesMission>;

/** Une fiche est inutilisable si les champs essentiels sont vides : on tente alors le modèle de repli. */
export function ficheCVValide(p: ProfilCV): boolean {
  return p.competences.length > 0 && p.resume.trim().length > 0 && (!!p.intitule_poste || p.annees_experience !== null);
}

export function borner(p: ProfilCV): ProfilCV {
  return {
    ...p,
    competences: p.competences.map((c) => ({
      ...c,
      niveau: c.niveau === null ? null : Math.min(5, Math.max(1, Math.round(c.niveau))),
      annees: c.annees === null ? null : Math.max(0, c.annees),
    })),
  };
}

export function bornerMission(m: ExigencesMission): ExigencesMission {
  return {
    ...m,
    competences: m.competences.map((c) => ({ ...c, importance: Math.min(3, Math.max(1, Math.round(c.importance))) })),
  };
}

/** Lecture d'une réponse à la relance des disponibilités (consignes : CONSIGNES_REPONSE_DISPO). */
export const SchemaReponseDisponibilite = z.object({
  situation: z.enum(["disponible", "disponible_a_partir", "en_mission", "plus_interesse", "pas_une_reponse"]),
  disponible_le: z.string().nullable(), // AAAA-MM-JJ
  texte_disponibilite: z.string().nullable(), // court, pour la colonne Disponibilité (ex. « Disponible le 15/01/2027 »)
  confiance: z.number(), // 0 à 1
});
export type ReponseDisponibilite = z.infer<typeof SchemaReponseDisponibilite>;

/** CV complet rangé dans les rubriques du modèle Unitech (consignes : CONSIGNES_CV_UNITECH). */
export const SchemaCVUnitech = z.object({
  titre: z.string(),
  annees_experience: z.number().nullable(),
  resume: z.string(),
  points_forts: z.array(z.object({ libelle: z.string(), detail: z.string() })),
  competences_metier: z.array(z.object({ domaine: z.string(), points: z.array(z.string()) })),
  outils: z.array(z.object({ categorie: z.string(), elements: z.string() })),
  langues: z.array(z.object({ langue: z.string(), niveau: z.string() })),
  formations: z.array(z.object({ annee: z.string().nullable(), intitule: z.string(), etablissement: z.string().nullable() })),
  experiences: z.array(z.object({
    entreprise: z.string(), poste: z.string(), periode: z.string(), projet: z.string().nullable(),
    missions: z.array(z.string()), environnement: z.string().nullable(),
  })),
});
export type CVStructure = z.infer<typeof SchemaCVUnitech>;

/** Section « Adéquation à la mission » (consignes : CONSIGNES_ADEQUATION). */
export const SchemaAdequation = z.object({
  resume: z.string(),
  points: z.array(z.object({ libelle: z.string(), detail: z.string() })),
});
export type Adequation = z.infer<typeof SchemaAdequation>;
