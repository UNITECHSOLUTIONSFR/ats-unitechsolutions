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
    compter("documents", ["type", "word_nominatif"]),
  ]);
  const prenom = (utilisateur.nomAffiche ?? "").split(" ")[0];

  return (
    <div className="space-y-8">
      <div className="carte flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <p className="text-zinc-500">Bonjour{prenom ? ` ${prenom}` : ""}</p>
          <h1 className="titre-page">Trouvez le bon consultant en une minute</h1>
          <p className="mt-1 text-zinc-600">Collez le besoin du client : l&apos;outil classe les profils et explique chaque score.</p>
        </div>
        <Link href="/missions/nouvelle" className="bouton-primaire"><IconePlus className="h-4 w-4" />Nouvelle mission</Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tuile titre="Consultants" valeur={consultants} lien="/consultants" Icone={IconePersonnes} />
        <Tuile titre="CV Unitech reliés (SharePoint)" valeur={lignes} lien="/cv" Icone={IconeTableau} />
        <Tuile titre="Missions ouvertes" valeur={missions} lien="/missions" Icone={IconeMallette} />
        <Tuile titre="Cas à vérifier" valeur={alertes} Icone={IconeAlerte} />
      </div>
    </div>
  );
}

function Tuile({ titre, valeur, lien, Icone }: {
  titre: string; valeur: number; lien?: string; Icone: (p: { className?: string }) => React.ReactNode;
}) {
  const contenu = (
    <div className="carte flex items-center gap-4 p-5 hover:ring-marque-300">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-marque-50 text-marque-600">
        <Icone className="h-6 w-6" />
      </span>
      <div>
        <div className="titre-page">{valeur.toLocaleString("fr-FR")}</div>
        <div className="text-zinc-500">{titre}</div>
      </div>
    </div>
  );
  return lien ? <Link href={lien}>{contenu}</Link> : contenu;
}
