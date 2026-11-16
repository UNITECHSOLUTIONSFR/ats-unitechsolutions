/**
 * Familles de métier : un développeur ne fait pas une mission de testeur QA, même si « Java » figure dans les deux.
 * La famille est déduite de l'intitulé du poste (mission) et du titre du consultant, par mots-clés, sans IA.
 * Ordre important : la première famille reconnue l'emporte (« Chef de projet Recette » = pilotage, « Tech Lead Data » = data).
 */
import { sansAccents } from "@/lib/metier/texte";

export type FamilleMetier = "test" | "pilotage" | "produit" | "data" | "securite" | "architecture" | "devops" | "infra" | "erp" | "dev";

export const LIBELLES_METIER: Record<FamilleMetier, string> = {
  test: "test / QA", pilotage: "chef de projet / pilotage", produit: "produit / analyse métier", data: "data / BI", securite: "sécurité",
  architecture: "architecture", devops: "DevOps / cloud", infra: "système / réseau / support", erp: "ERP / CRM / fonctionnel", dev: "développement",
};

const REGLES: [FamilleMetier, RegExp][] = [
  ["pilotage", /\b(chef(fe)? de projet|chef de programme|directeur de projet|directeur de programme|project manager|program(me)? manager|pmo|scrum master|coach agile|delivery manager|engineering manager|chef d'equipe|responsable d'application|incident (and )?change manager|change manager)\b/],
  ["test", /\b(testeur|tester|qa|recette|recetteur|ingenieur de test|test lead|test manager|automaticien|qualification logicielle|homologation)\b/],
  ["produit", /\b(product owner|po|proxy po|business analyst|ba|amoa|moa|analyste fonctionnel|functional analyst|consultant fonctionnel|product manager)\b/],
  ["securite", /\b(securite|cyber|soc|pentest|pentester|rssi|iam|grc|cybersecurite|security)\b/],
  ["data", /\b(data|bi|business intelligence|decisionnel|power ?bi|big data|etl|datastage|talend|informatica|teradata|analytics|machine learning|ml ?ops|data ?scien\w*|statisticien)\b/],
  ["architecture", /\b(architecte|architect|urbaniste)\b/],
  ["devops", /\b(devops|sre|site reliability|cloud engineer|ingenieur cloud|platform engineer|observabilite|kubernetes)\b/],
  ["erp", /\b(sap|ivalua|dynamics|crm|erp|salesforce|servicenow|oracle (ebs|fusion)|workday|sage|technico[- ]fonctionnel)\b/],
  ["infra", /\b(administrateur|admin sys|systeme|reseau|network|infrastructure|infra|support|technicien|poste de travail|datacenter|telecom\w*|exploitation|production informatique|integrateur)\b/],
  ["dev", /\b(developpeur|developpeuse|developer|dev|fullstack|full[- ]stack|front[- ]?end|back[- ]?end|tech ?lead|lead tech|ingenieur logiciel|software engineer|concepteur[- ]developpeur|programmeur|mobile|ios|android)\b/],
];

/** Famille de métier d'un intitulé, ou null si rien n'est reconnu (aucun effet sur le score). */
export function familleMetier(intitule: string | null | undefined): FamilleMetier | null {
  if (!intitule) return null;
  const t = sansAccents(intitule).toLowerCase().replace(/[’']/g, "'");
  for (const [famille, re] of REGLES) if (re.test(t)) return famille;
  return null;
}

/** Familles voisines : un profil de l'une peut convenir pour l'autre (score réduit), jamais écarté. */
const VOISINES: [FamilleMetier, FamilleMetier][] = [
  ["dev", "devops"], ["dev", "architecture"], ["dev", "data"], ["devops", "infra"], ["devops", "architecture"], ["data", "architecture"],
  ["infra", "securite"], ["securite", "architecture"], ["pilotage", "produit"], ["produit", "erp"], ["produit", "test"], ["erp", "pilotage"], ["infra", "architecture"],
];

/** 1 = même métier ; 0,6 = métier voisin ; 0 = métier différent ; null = au moins un métier inconnu. */
export function compatibiliteMetier(mission: FamilleMetier | null, consultant: FamilleMetier | null): 1 | 0.6 | 0 | null {
  if (!mission || !consultant) return null;
  if (mission === consultant) return 1;
  return VOISINES.some(([a, b]) => (a === mission && b === consultant) || (a === consultant && b === mission)) ? 0.6 : 0;
}
