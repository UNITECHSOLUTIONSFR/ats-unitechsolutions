import Link from "next/link";
import { exigerUtilisateur } from "@/lib/acces";
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
    compter("tableau_lignes"),
  ]);
  const prenom = (utilisateur.nomAffiche ?? "").split(" ")[0];

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
        <Tuile titre="Lignes du tableau de suivi" valeur={lignes} lien="/tableau" Icone={IconeTableau} teinte="from-sky-500 to-cyan-600" />
        <Tuile titre="Missions ouvertes" valeur={missions} lien="/missions" Icone={IconeMallette} teinte="from-violet-500 to-fuchsia-600" />
        <Tuile titre="Cas à vérifier" valeur={alertes} Icone={IconeAlerte} teinte="from-amber-400 to-orange-500" />
      </div>
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
