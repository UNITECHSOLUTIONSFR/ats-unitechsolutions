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

/** Au plus 4 compétences obligatoires (les plus importantes) : au-delà, plus personne ne passe le filtre. */
export const MAX_OBLIGATOIRES = 4;

export function bornerMission(m: ExigencesMission): ExigencesMission {
  const competences = m.competences.slice(0, 20).map((c) => ({ ...c, importance: Math.min(3, Math.max(1, Math.round(c.importance))) }));
  const gardees = new Set(competences.map((c, i) => ({ c, i })).filter((x) => x.c.obligatoire)
    .sort((a, b) => b.c.importance - a.c.importance || a.i - b.i).slice(0, MAX_OBLIGATOIRES).map((x) => x.i));
  return { ...m, competences: competences.map((c, i) => ({ ...c, obligatoire: c.obligatoire && gardees.has(i), importance: c.obligatoire && !gardees.has(i) ? 3 : c.importance })) };
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

/** Critères d'une recherche en conversation (section « Recherche ») : mis à jour à chaque message. */
export const SchemaCriteresRecherche = z.object({
  poste: z.string().nullable(),
  competences: z.array(z.object({ nom: z.string(), obligatoire: z.boolean() })),
  annees_min: z.number().nullable(),
  annees_max: z.number().nullable(),
  seniorite: z.enum(SENIORITES).nullable(),
  lieu: z.string().nullable(),
  mots_cles: z.array(z.string()),
  reponse: z.string(),
});
export type CriteresRecherche = z.infer<typeof SchemaCriteresRecherche>;

/** Avis de l'IA : adéquation d'un consultant à une mission, lu dans la fiche de poste et le CV. */
export const SchemaAvisMission = z.object({
  verdict: z.enum(["fort", "moyen", "faible"]),
  resume: z.string(),
  points_forts: z.array(z.string()),
  manques: z.array(z.string()),
  questions: z.array(z.string()),
});
export type AvisMission = z.infer<typeof SchemaAvisMission>;

/** Tri des meilleurs profils d'une mission par l'IA : chaque profil (référence C1, C2…) est jugé sur le contenu, pas sur des mots-clés. */
export const SchemaTriCandidats = z.object({
  avis: z.array(z.object({
    ref: z.string(),
    verdict: z.enum(["pertinent", "a_etudier", "hors_sujet"]),
    raison: z.string(),
  })),
});
export type TriCandidats = z.infer<typeof SchemaTriCandidats>;

/** Matching (17/11/2026) : note de l'IA sur 100 et raison, pour chaque profil présélectionné (référence C1, C2…). */
export const SchemaNoteCandidats = z.object({
  notes: z.array(z.object({
    ref: z.string(),
    note: z.number(), // 0 à 100
    raison: z.string(),
  })),
});
export type NoteCandidats = z.infer<typeof SchemaNoteCandidats>;

/** Matching v2 (18/11/2026) : ce qui décide d'une mission. Synonymes en minuscules, tels qu'ils s'écrivent dans un CV. */
export const SchemaCriteresMission = z.object({
  metier: z.object({ libelle: z.string(), synonymes: z.array(z.string()) }),
  obligatoires: z.array(z.object({ critere: z.string(), synonymes: z.array(z.string()) })),
  souhaites: z.array(z.string()),
});
export type CriteresMission = z.infer<typeof SchemaCriteresMission>;

/** Matching v2 : note d'un CV complet, avec la vérification explicite des critères obligatoires (règle appliquée par l'outil). */
export const SchemaNoteCV = z.object({
  notes: z.array(z.object({
    ref: z.string(),
    criteres_prouves: z.boolean(), // vrai seulement si CHAQUE critère obligatoire est prouvé par une vraie expérience
    note: z.number(),
    raison: z.string(),
  })),
});
export type NoteCV = z.infer<typeof SchemaNoteCV>;
