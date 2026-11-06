import Link from "next/link";
import { exigerUtilisateur } from "@/lib/acces";

export default async function Accueil() {
  const { supabase } = await exigerUtilisateur();
  const compter = async (table: string, filtre?: [string, string]) => {
    let q = supabase.from(table).select("*", { count: "exact", head: true });
    if (filtre) q = q.eq(filtre[0], filtre[1]);
    return (await q).count ?? 0;
  };
  const [consultants, missions, alertes] = await Promise.all([
    compter("consultants"),
    compter("missions", ["statut", "ouverte"]),
    compter("alertes", ["statut", "ouverte"]),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Tableau de bord</h1>
        <Link href="/missions/nouvelle" className="rounded-lg bg-zinc-900 px-4 py-2 font-medium text-white">
          + Nouvelle mission
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Tuile titre="Consultants" valeur={consultants} lien="/consultants" />
        <Tuile titre="Missions ouvertes" valeur={missions} lien="/missions" />
        <Tuile titre="Cas à vérifier" valeur={alertes} />
      </div>
    </div>
  );
}

function Tuile({ titre, valeur, lien }: { titre: string; valeur: number; lien?: string }) {
  const contenu = (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
      <div className="text-sm text-zinc-500">{titre}</div>
      <div className="mt-1 text-3xl font-semibold">{valeur.toLocaleString("fr-FR")}</div>
    </div>
  );
  return lien ? <Link href={lien}>{contenu}</Link> : contenu;
}
