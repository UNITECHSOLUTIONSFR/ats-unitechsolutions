import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { indexerReferentiel, resoudreCompetence, type CompetenceReferentiel } from "./referentiel";
import { normaliserCompetence } from "@/lib/metier/texte";

/** Rattache chaque compétence extraite au référentiel ; les nouvelles sont ajoutées automatiquement. */
export async function resoudreCompetences(supabase: SupabaseClient, noms: string[]): Promise<Map<string, string>> {
  const { data } = await supabase.from("competences").select("id, nom_canonique, synonymes");
  const index = indexerReferentiel((data ?? []) as CompetenceReferentiel[]);
  const resultat = new Map<string, string>(); // nom extrait -> id
  for (const nom of noms) {
    const trouvee = resoudreCompetence(nom, index);
    if (trouvee) {
      resultat.set(nom, trouvee.id);
      continue;
    }
    const { data: nouvelle, error } = await supabase
      .from("competences")
      .insert({ nom_canonique: nom.trim(), synonymes: [normaliserCompetence(nom)], creee_automatiquement: true })
      .select("id, nom_canonique, synonymes")
      .single();
    if (error || !nouvelle) continue;
    index.set(normaliserCompetence(nom), nouvelle as CompetenceReferentiel);
    resultat.set(nom, nouvelle.id);
  }
  return resultat;
}

