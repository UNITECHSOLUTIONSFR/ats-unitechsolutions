import Link from "next/link";
import { exigerUtilisateur } from "@/lib/acces";
import { COLONNE_DOMAINE } from "@/lib/import/excel";
import { chargerApercuTableau } from "@/lib/tableau/chargement";
import ChargeurTableau from "./chargeur";

export default async function TableauDeSuivi({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const { utilisateur, supabase } = await exigerUtilisateur();
  const { vue } = await searchParams;
  // Seulement les 100 premières lignes ici (affichage immédiat) ; le reste est chargé par l'écran, en arrière-plan.
  const apercu = await chargerApercuTableau(supabase);

  if (!apercu) {
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
  return <ChargeurTableau apercu={apercu} vueInitiale={vue === "email_jour" || vue === "sharepoint_jour" ? vue : ""} colonneDomaine={COLONNE_DOMAINE} estAdmin={utilisateur.role === "admin"} />;
}
