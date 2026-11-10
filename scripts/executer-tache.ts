/**
 * Exécute une synchronisation depuis une session d'administration (sans passer par le site).
 * Usage : NODE_USE_ENV_PROXY=1 NODE_OPTIONS=--conditions=react-server npx tsx scripts/executer-tache.ts <excel|cv-fichiers>
 * Variables : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY (jamais affichée), MS_CLIENT_SECRET.
 * « cv-fichiers » = référencement, association et rattachement des CV, sans l'analyse par l'IA.
 */
import { clientSupabaseAdmin } from "../src/lib/supabase/admin";
import { executerTache } from "../src/lib/sync/taches";
import { synchroniserCV } from "../src/lib/sync/cv";

async function main() {
  const tache = process.argv[2];
  const supabase = clientSupabaseAdmin();
  if (tache === "excel") console.log(JSON.stringify(await executerTache("excel", supabase)));
  else if (tache === "cv-fichiers") {
    const { data: e } = await supabase.from("executions").insert({ type: "synchro_cv" }).select("id").single();
    const synchro = await synchroniserCV(supabase);
    await supabase.from("executions").update({ fin: new Date().toISOString(), statut: "termine", rapport: { synchro, envoiAnalyse: "analyse IA à lancer depuis l'outil" } }).eq("id", e!.id);
    console.log(JSON.stringify({ ok: true, synchro }));
  } else throw new Error("Tâche inconnue");
}
main().catch((e) => { console.error(e.message); process.exit(1); });
