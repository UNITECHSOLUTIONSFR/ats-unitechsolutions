import Link from "next/link";
import { exigerUtilisateur } from "@/lib/acces";
import { champsParEntete } from "@/lib/import/excel";
import type { LigneTableau } from "@/lib/tableau/modele";
import TableauExcel from "./tableau-excel";

export default async function TableauDeSuivi({ searchParams }: { searchParams: Promise<{ onglet?: string }> }) {
  const { utilisateur, supabase } = await exigerUtilisateur();
  const { onglet: choisi } = await searchParams;
  const { data: onglets } = await supabase.from("tableau_onglets").select("id, nom, entetes, principal").order("position");

  if (!onglets?.length) {
    return (
      <div className="space-y-4">
        <h1 className="titre-page">Tableau de suivi</h1>
        <div className="carte p-8 text-center text-zinc-600">
          <p>Le tableau n&apos;est pas encore chargé.</p>
          {utilisateur.role === "admin" ? (
            <p className="mt-2">
              Importez votre fichier Excel dans{" "}
              <Link href="/parametres/import" className="font-medium text-marque-700 underline">Paramètres → Import du fichier Excel</Link> :
              tous les onglets seront repris à l&apos;identique.
            </p>
          ) : (
            <p className="mt-2">Un administrateur doit d&apos;abord importer le fichier Excel.</p>
          )}
        </div>
      </div>
    );
  }

  const onglet = onglets.find((o) => o.id === choisi) ?? onglets[0];
  const lignes: LigneTableau[] = [];
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await supabase
      .from("tableau_lignes")
      .select("id, position, consultant_id, valeurs")
      .eq("onglet_id", onglet.id)
      .order("position")
      .range(debut, debut + 999);
    if (error) break;
    lignes.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  return (
    <TableauExcel
      key={onglet.id}
      onglets={onglets.map((o) => ({ id: o.id, nom: o.nom }))}
      ongletId={onglet.id}
      entetes={onglet.entetes}
      champs={onglet.principal ? champsParEntete(onglet.entetes, onglet.entetes) : {}}
      lignes={lignes}
      estAdmin={utilisateur.role === "admin"}
    />
  );
}
