import Link from "next/link";
import { exigerUtilisateur } from "@/lib/acces";
import { resumerRapport } from "@/lib/sync/resume";
import { TACHES } from "@/lib/sync/taches";
import { IconeAlerte, IconeMallette, IconePersonnes, IconePlus, IconeTableau } from "./icones";

export default async function Accueil() {
  const { utilisateur, supabase } = await exigerUtilisateur();
  const compter = async (table: string, filtre?: [string, string]) => {
    let q = supabase.from(table).select("*", { count: "exact", head: true });
    if (filtre) q = q.eq(filtre[0], filtre[1]);
    return (await q).count ?? 0;
  };
  const [consultants, missions, alertes, lignes] = await Promise.all([
    compter("consultants"),
    compter("missions", ["statut", "ouverte"]),
    compter("alertes", ["statut", "ouverte"]),
    compter("documents", ["type", "word_nominatif"]),
  ]);
  const prenom = (utilisateur.nomAffiche ?? "").split(" ")[0];
  // Rapport du matin : traitements des dernières 24 heures.
  const { data: nuit } = await supabase.from("executions").select("type, debut, statut, rapport")
    .in("type", Object.values(TACHES).map((t) => t.type)).gte("debut", ilYa24h())
    .order("debut", { ascending: false }).limit(10);

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-nuit via-nuit-clair to-marque-800 p-8 text-white shadow-xl">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-marque-500/30 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm text-marque-200">Bonjour{prenom ? ` ${prenom}` : ""} 👋</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Trouvez le bon consultant en une minute.</h1>
            <p className="mt-2 max-w-xl text-slate-300">Saisissez le besoin du client : l&apos;outil classe les profils et explique chaque score.</p>
          </div>
          <Link href="/missions/nouvelle" className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-semibold text-nuit shadow-lg transition hover:bg-marque-50">
            <IconePlus className="h-5 w-5" />Nouvelle mission
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tuile titre="Consultants" valeur={consultants} lien="/consultants" Icone={IconePersonnes} teinte="from-marque-500 to-marque-700" />
        <Tuile titre="CV Unitech reliés (SharePoint)" valeur={lignes} lien="/cv" Icone={IconeTableau} teinte="from-sky-500 to-cyan-600" />
        <Tuile titre="Missions ouvertes" valeur={missions} lien="/missions" Icone={IconeMallette} teinte="from-violet-500 to-fuchsia-600" />
        <Tuile titre="Cas à vérifier" valeur={alertes} lien="/alertes" Icone={IconeAlerte} teinte="from-amber-400 to-orange-500" />
      </div>

      <section className="carte p-5">
        <h2 className="font-semibold">Rapport des dernières 24 heures</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {(nuit ?? []).map((e, k) => (
            <li key={k} className={e.statut === "echec" ? "text-red-700" : "text-zinc-600"}>
              <span className="text-zinc-400">{new Date(e.debut).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>{" "}
              {resumerRapport(e.type, e.rapport as Record<string, unknown>)}
            </li>
          ))}
          {!nuit?.length && <li className="text-zinc-500">Aucun traitement automatique depuis hier.</li>}
        </ul>
        {alertes > 0 && <Link href="/alertes" className="mt-3 inline-block text-sm font-medium text-marque-700 hover:underline">{alertes} cas à vérifier →</Link>}
      </section>
    </div>
  );
}

function Tuile({ titre, valeur, lien, Icone, teinte }: {
  titre: string; valeur: number; lien?: string; Icone: (p: { className?: string }) => React.ReactNode; teinte: string;
}) {
  const contenu = (
    <div className="carte group flex items-center gap-4 p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
      <span className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${teinte} text-white shadow-md`}>
        <Icone className="h-6 w-6" />
      </span>
      <div>
        <div className="text-3xl font-semibold tracking-tight">{valeur.toLocaleString("fr-FR")}</div>
        <div className="text-sm text-zinc-500">{titre}</div>
      </div>
    </div>
  );
  return lien ? <Link href={lien}>{contenu}</Link> : contenu;
}

/** Date d'il y a 24 heures (rapport du matin). */
function ilYa24h(): string {
  return new Date(Date.now() - 86_400_000).toISOString();
}
