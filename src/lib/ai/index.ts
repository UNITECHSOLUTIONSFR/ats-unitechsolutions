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
import { CONSIGNES_MISSION, CONSIGNES_PROFIL_CV } from "./consignes";
import {
  PROMPT_VERSION,
  SchemaExigencesMission,
  SchemaProfilCV,
  borner,
  bornerMission,
  ficheCVValide,
  type ExigencesMission,
  type ProfilCV,
} from "./schemas";

export { PROMPT_VERSION };
export type { ExigencesMission, ProfilCV };

export interface UsageIA {
  usage: "fiche_cv" | "mission" | "tri_email" | "analyse_approfondie";
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

/** Requête de lot (Batch API, 50 % moins cher) pour structurer un CV : import initial et synchronisation de nuit. */
export function requeteLotProfilCV(identifiant: string, texteCV: string, modele: string = MODELES.ficheCV) {
  return {
    custom_id: identifiant,
    params: parametresExtraction(modele, CONSIGNES_PROFIL_CV, SchemaProfilCV, texteCV, MAX_TOKENS.ficheCV),
  };
}
