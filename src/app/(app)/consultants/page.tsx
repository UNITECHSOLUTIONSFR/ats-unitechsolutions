import Link from "next/link";
import { exigerUtilisateur } from "@/lib/acces";
import { COLONNE_DOMAINE } from "@/lib/import/excel";
import ChargeurTableau from "./chargeur";

export default async function TableauDeSuivi({ searchParams }: { searchParams: Promise<{ domaine?: string }> }) {
  const { utilisateur, supabase } = await exigerUtilisateur();
  const { domaine } = await searchParams;
  // Vérification légère seulement : les lignes sont chargées ensuite par l'écran lui-même (affichage immédiat).
  const { count } = await supabase.from("tableau_onglets").select("id", { count: "exact", head: true }).eq("principal", true);

  if (!count) {
    return (
      <div className="space-y-4">
        <h1 className="titre-page">Consultants</h1>
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
  return <ChargeurTableau vueInitiale={domaine ?? ""} colonneDomaine={COLONNE_DOMAINE} estAdmin={utilisateur.role === "admin"} />;
}
