import Link from "next/link";
import { exigerUtilisateur } from "@/lib/acces";
import { champsParEntete } from "@/lib/import/excel";
import { lirePageTableau, type CriteresTableau } from "@/lib/tableau/page";
import TableauExcel from "./tableau-excel";

/** Vues de l'écran Consultants : toute la base, ou les arrivées du jour (email, SharePoint). Les métiers se filtrent par la colonne « Domaine ». */
const VUES = [{ cle: "", nom: "Toute la base" }, { cle: "email_jour", nom: "Reçus par email aujourd'hui" }, { cle: "sharepoint_jour", nom: "Ajoutés depuis SharePoint aujourd'hui" }];

/**
 * Écran Consultants : la première page (50 lignes) est préparée ici et affichée tout de suite ;
 * recherche, filtres, tri et pages suivantes sont demandés à la base au fur et à mesure (jamais toute la base).
 */
export default async function TableauDeSuivi({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  const { utilisateur, supabase } = await exigerUtilisateur();
  const { vue } = await searchParams;
  const { data: onglet } = await supabase.from("tableau_onglets").select("id, entetes").eq("principal", true).maybeSingle();

  if (!onglet) {
    return (
      <div className="space-y-4">
        <h1 className="titre-page">Consultants</h1>
        <div className="carte p-8 text-center text-zinc-600">
          <p>Le tableau n&apos;est pas encore chargé.</p>
          {utilisateur.role === "admin" ? (
            <p className="mt-2">
              Le fichier de suivi est relu chaque nuit ; vérifiez sa synchronisation dans{" "}
              <Link href="/parametres/synchronisations" className="font-medium text-marque-700 underline">Paramètres → Synchronisations</Link>.
            </p>
          ) : (
            <p className="mt-2">Le fichier de suivi sera chargé lors de la prochaine synchronisation.</p>
          )}
        </div>
      </div>
    );
  }
  const entetes = onglet.entetes as string[];
  const champs = champsParEntete(entetes, entetes);
  // Tri par défaut : ordre alphabétique des prénoms.
  const colonnePrenom = Object.entries(champs).find(([, c]) => c === "prenom")?.[0];
  const criteres: CriteresTableau = {
    filtres: {}, recherche: "", tri: colonnePrenom ? { colonne: colonnePrenom, sens: "asc" } : null, rapides: [],
    vue: vue === "email_jour" || vue === "sharepoint_jour" ? vue : "", avecCV: true, page: 0,
  };
  const premiere = await lirePageTableau(supabase, criteres);
  return <TableauExcel vues={VUES} criteresInitiaux={criteres} premiere={premiere} ongletId={onglet.id} entetes={entetes} champs={champs} estAdmin={utilisateur.role === "admin"} />;
}
