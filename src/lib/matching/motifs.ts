import { sansAccents } from "@/lib/metier/texte";

/**
 * Expression régulière (minuscules) qui retrouve une compétence dans un texte de CV ou une ligne d'Excel,
 * à partir de son nom et de ses synonymes. Mots entiers : « java » ne trouve pas « javascript ».
 * Les termes trop courts et ambigus (« r », « go », « ts ») sont ignorés.
 */
export function motifCompetence(nom: string, synonymes: string[] = []): string | null {
  const termes = new Set<string>();
  // « Google Apigee », « Apache Kafka », « Microsoft Power BI » : les CV écrivent souvent le produit seul.
  const sansEditeur = (t: string) => t.replace(/^(google|apache|microsoft|ms|amazon|aws|ibm|oracle|adobe|atlassian|hashicorp|red hat|redhat)\s+(?=\S{3,})/i, "");
  for (const t of [nom, ...synonymes, ...[nom, ...synonymes].map(sansEditeur)]) {
    const bas = t.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
    for (const forme of [bas, sansAccents(bas)]) {
      const symbole = /[#+.]/.test(forme);
      if (forme.length >= 3 || (symbole && forme.length >= 2)) termes.add(forme);
    }
  }
  if (!termes.size) return null;
  const echapper = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "[\\s\\-_]?");
  const liste = [...termes].sort((a, b) => b.length - a.length).map(echapper).join("|");
  return `(^|[^a-z0-9à-ÿ])(${liste})($|[^a-z0-9à-ÿ#+])`;
}
