import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decouperCompetence, indexerReferentiel, nomPourNouvelle, resoudreCompetence, type CompetenceReferentiel } from "./referentiel";
import { normaliserCompetence } from "@/lib/metier/texte";

/**
 * Rattache chaque compétence extraite au référentiel. Un nom double (« C# / .NET ») donne plusieurs compétences ;
 * une variante (« .NET 8 », « ASP.NET MVC ») retrouve sa famille ; une vraie nouveauté est ajoutée sous son nom sans version.
 * Résultat : nom extrait -> identifiants (un ou plusieurs).
 */
export async function resoudreCompetences(supabase: SupabaseClient, noms: string[]): Promise<Map<string, string[]>> {
  const { data } = await supabase.from("competences").select("id, nom_canonique, synonymes");
  const index = indexerReferentiel((data ?? []) as CompetenceReferentiel[]);
  const resultat = new Map<string, string[]>();
  for (const nom of noms) {
    const ids: string[] = [];
    for (const partie of decouperCompetence(nom)) {
      const trouvee = resoudreCompetence(partie, index);
      if (trouvee) { if (!ids.includes(trouvee.id)) ids.push(trouvee.id); continue; }
      const nouveau = nomPourNouvelle(partie);
      const existante = resoudreCompetence(nouveau, index);
      if (existante) { if (!ids.includes(existante.id)) ids.push(existante.id); continue; }
      const { data: nouvelle, error } = await supabase
        .from("competences")
        .insert({ nom_canonique: nouveau, synonymes: [...new Set([normaliserCompetence(nouveau), normaliserCompetence(partie)])], creee_automatiquement: true })
        .select("id, nom_canonique, synonymes")
        .single();
      if (error || !nouvelle) continue;
      for (const s of (nouvelle as CompetenceReferentiel).synonymes) index.set(s, nouvelle as CompetenceReferentiel);
      ids.push(nouvelle.id);
    }
    if (ids.length) resultat.set(nom, ids);
  }
  return resultat;
}
