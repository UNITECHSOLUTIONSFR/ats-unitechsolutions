/**
 * Module IA unique de l'application (règle du brief : tous les appels à l'IA passent ici).
 * Pour changer de fournisseur, on remplace l'implémentation sans toucher au reste du code.
 * Côté serveur uniquement : la clé ANTHROPIC_API_KEY n'est jamais envoyée au navigateur.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { LONGUEUR_MAX_TEXTE, MAX_TOKENS, MODELES, estimerCoutUSD } from "./config";
import { CONSIGNES_MISSION, CONSIGNES_PROFIL_CV, CONSIGNES_REPONSE_DISPO } from "./consignes";
import {
  PROMPT_VERSION,
  SchemaExigencesMission,
  SchemaProfilCV,
  SchemaReponseDisponibilite,
  borner,
  bornerMission,
  ficheCVValide,
  type ExigencesMission,
  type ProfilCV,
  type ReponseDisponibilite,
} from "./schemas";

export { PROMPT_VERSION };
export type { ExigencesMission, ProfilCV, ReponseDisponibilite };

export interface UsageIA {
  usage: "fiche_cv" | "mission" | "tri_email" | "analyse_approfondie" | "reponse_disponibilite";
  modele: string;
  mode: "standard" | "batch";
  tokens_entree: number;
  tokens_sortie: number;
  tokens_cache_lecture: number;
  tokens_cache_ecriture: number;
  cout_estime_usd: number;
}

export interface ResultatIA<T> {
  donnees: T;
  modele: string;
  promptVersion: string;
  usages: UsageIA[]; // un élément par appel (2 si le repli a servi)
}

export class ErreurIA extends Error {}

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new ErreurIA("Clé ANTHROPIC_API_KEY absente de la configuration du serveur.");
  client ??= new Anthropic();
  return client;
}

export function tronquer(texte: string): string {
  return texte.length > LONGUEUR_MAX_TEXTE ? texte.slice(0, LONGUEUR_MAX_TEXTE) : texte;
}

/** Paramètres de réflexion : aucune réflexion facturée pour de l'extraction. */
export function parametresReflexion(modele: string) {
  return modele.startsWith("claude-sonnet")
    ? { thinking: { type: "between_tools" as const }, effort: "low" as const } // Sonnet 5.5 refuse « disabled »
    : { thinking: { type: "disabled" as const }, effort: "low" as const };
}

/** Paramètres d'un appel d'extraction ; réutilisés tels quels par la Batch API (import, nuit). */
export function parametresExtraction(
  modele: string,
  consignes: string,
  schema: z.ZodType,
  texte: string,
  maxTokens: number,
): Anthropic.MessageCreateParamsNonStreaming {
  const { thinking, effort } = parametresReflexion(modele);
  return {
    model: modele,
    max_tokens: maxTokens,
    system: [{ type: "text", text: consignes, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: tronquer(texte) }],
    thinking,
    output_config: { effort, format: zodOutputFormat(schema) },
  } as Anthropic.MessageCreateParamsNonStreaming;
}

export function usageDepuisReponse(
  usage: Anthropic.Usage,
  modele: string,
  type: UsageIA["usage"],
  mode: UsageIA["mode"],
): UsageIA {
  const t = {
    entree: usage.input_tokens ?? 0,
    sortie: usage.output_tokens ?? 0,
    cacheLecture: usage.cache_read_input_tokens ?? 0,
    cacheEcriture: usage.cache_creation_input_tokens ?? 0,
  };
  return {
    usage: type,
    modele,
    mode,
    tokens_entree: t.entree,
    tokens_sortie: t.sortie,
    tokens_cache_lecture: t.cacheLecture,
    tokens_cache_ecriture: t.cacheEcriture,
    cout_estime_usd: estimerCoutUSD(modele, t, mode),
  };
}

/** Lit la réponse JSON d'un message (appel standard ou résultat de lot) et la valide. */
export function lireJSON<T>(message: Anthropic.Message, schema: z.ZodType<T>): T | null {
  if (message.stop_reason === "refusal" || message.stop_reason === "max_tokens") return null;
  const texte = message.content.find((b) => b.type === "text");
  if (!texte || texte.type !== "text") return null;
  try {
    const r = schema.safeParse(JSON.parse(texte.text));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

async function appeler<T>(
  modele: string,
  consignes: string,
  schema: z.ZodType<T>,
  texte: string,
  maxTokens: number,
  type: UsageIA["usage"],
): Promise<{ donnees: T | null; usage: UsageIA }> {
  const message = await anthropic().messages.create(parametresExtraction(modele, consignes, schema, texte, maxTokens));
  return { donnees: lireJSON(message, schema), usage: usageDepuisReponse(message.usage, modele, type, "standard") };
}

/** Structure un CV en fiche. Haiku d'abord ; une seule tentative de repli avec Sonnet si la fiche est invalide. */
export async function extraireProfilCV(texteCV: string): Promise<ResultatIA<ProfilCV>> {
  const usages: UsageIA[] = [];
  const premier = await appeler(MODELES.ficheCV, CONSIGNES_PROFIL_CV, SchemaProfilCV, texteCV, MAX_TOKENS.ficheCV, "fiche_cv");
  usages.push(premier.usage);
  if (premier.donnees && ficheCVValide(premier.donnees)) {
    return { donnees: borner(premier.donnees), modele: MODELES.ficheCV, promptVersion: PROMPT_VERSION, usages };
  }
  const repli = await appeler(MODELES.ficheCVRepli, CONSIGNES_PROFIL_CV, SchemaProfilCV, texteCV, MAX_TOKENS.ficheCV, "fiche_cv");
  usages.push(repli.usage);
  if (repli.donnees) {
    return { donnees: borner(repli.donnees), modele: MODELES.ficheCVRepli, promptVersion: PROMPT_VERSION, usages };
  }
  throw Object.assign(new ErreurIA("Fiche CV impossible à produire."), { usages });
}

/** Extrait les exigences d'un besoin client collé dans l'application. */
export async function extraireExigencesMission(texteBesoin: string): Promise<ResultatIA<ExigencesMission>> {
  const r = await appeler(MODELES.mission, CONSIGNES_MISSION, SchemaExigencesMission, texteBesoin, MAX_TOKENS.mission, "mission");
  if (!r.donnees) throw Object.assign(new ErreurIA("Exigences de la mission impossibles à extraire."), { usages: [r.usage] });
  return { donnees: bornerMission(r.donnees), modele: MODELES.mission, promptVersion: PROMPT_VERSION, usages: [r.usage] };
}

/**
 * Lit la réponse d'un consultant à la relance des disponibilités (Haiku, réponse courte, réflexion coupée).
 * `aujourdhui` (AAAA-MM-JJ) sert à convertir « dans un mois », « début janvier », etc.
 */
export async function lireReponseDisponibilite(texteReponse: string, aujourdhui: string): Promise<ResultatIA<ReponseDisponibilite>> {
  const texte = `Date du jour : ${aujourdhui}\n\nRéponse du consultant :\n${texteReponse.slice(0, 4000)}`;
  const r = await appeler(MODELES.reponseDisponibilite, CONSIGNES_REPONSE_DISPO, SchemaReponseDisponibilite, texte, MAX_TOKENS.reponseDisponibilite, "reponse_disponibilite");
  if (!r.donnees) throw Object.assign(new ErreurIA("Réponse impossible à lire."), { usages: [r.usage] });
  return { donnees: r.donnees, modele: MODELES.reponseDisponibilite, promptVersion: PROMPT_VERSION, usages: [r.usage] };
}

/** Requête de lot (Batch API, 50 % moins cher) pour structurer un CV : import initial et synchronisation de nuit. */
export function requeteLotProfilCV(identifiant: string, texteCV: string, modele: string = MODELES.ficheCV) {
  return {
    custom_id: identifiant,
    params: parametresExtraction(modele, CONSIGNES_PROFIL_CV, SchemaProfilCV, texteCV, MAX_TOKENS.ficheCV),
  };
}

/** Envoie un lot de CV à structurer (Batch API, 50 % moins cher). Renvoie l'identifiant du lot. */
export async function envoyerLotProfilsCV(cv: { id: string; texte: string; modele?: string }[]): Promise<string> {
  const lot = await anthropic().messages.batches.create({ requests: cv.map((c) => requeteLotProfilCV(c.id, c.texte, c.modele)) });
  return lot.id;
}

export interface ResultatLotCV {
  id: string;
  profil: ProfilCV | null; // null : réponse invalide ou erreur
  usage: UsageIA | null;
}

/** État d'un lot ; quand il est terminé, renvoie la fiche structurée de chaque CV. */
export async function lireLotProfilsCV(idLot: string): Promise<{ termine: boolean; enCours: number; resultats: ResultatLotCV[] }> {
  const lot = await anthropic().messages.batches.retrieve(idLot);
  if (lot.processing_status !== "ended") return { termine: false, enCours: lot.request_counts.processing, resultats: [] };
  const resultats: ResultatLotCV[] = [];
  for await (const r of await anthropic().messages.batches.results(idLot)) {
    if (r.result.type !== "succeeded") {
      resultats.push({ id: r.custom_id, profil: null, usage: null });
      continue;
    }
    const message = r.result.message;
    const profil = lireJSON(message, SchemaProfilCV);
    resultats.push({
      id: r.custom_id,
      profil: profil && ficheCVValide(profil) ? borner(profil) : null,
      usage: usageDepuisReponse(message.usage, MODELES.ficheCV, "fiche_cv", "batch"),
    });
  }
  return { termine: true, enCours: 0, resultats };
}
