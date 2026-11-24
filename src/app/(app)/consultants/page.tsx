import Link from "next/link";
import { exigerUtilisateur } from "@/lib/acces";
import { champsParEntete } from "@/lib/import/excel";
import { lirePageTableau, type CriteresTableau } from "@/lib/tableau/page";
import TableauExcel from "./tableau-excel";
import ListeCollective from "./collective";

/** Vues de l'écran Consultants : toute la base, ou les arrivées du jour (email, SharePoint). Les métiers se filtrent par la colonne « Domaine ». */
const VUES = [{ cle: "", nom: "Toute la base" }, { cle: "email_jour", nom: "Reçus par email aujourd'hui" }, { cle: "sharepoint_jour", nom: "Ajoutés depuis SharePoint aujourd'hui" }];

/**
 * Écran Consultants : la première page (50 lignes) est préparée ici et affichée tout de suite ;
 * recherche, filtres, tri et pages suivantes sont demandés à la base au fur et à mesure (jamais toute la base).
 */
/** Onglets de l'écran : le tableau de suivi, et les profils venus de Collective (24/11/2026). */
function Onglets({ actif, nombre }: { actif: "tableau" | "collective"; nombre?: number | null }) {
  const classe = (oui: boolean) => `rounded-full px-4 py-1.5 text-sm font-semibold ${oui ? "bg-nuit text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`;
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Onglets Consultants">
      <Link href="/consultants" className={classe(actif === "tableau")}>Tableau de suivi</Link>
      <Link href="/consultants?onglet=collective" className={classe(actif === "collective")}>Collective{nombre ? ` (${nombre})` : ""}</Link>
    </nav>
  );
}

export default async function TableauDeSuivi({ searchParams }: { searchParams: Promise<{ vue?: string; onglet?: string; page?: string }> }) {
  const { utilisateur, supabase } = await exigerUtilisateur();
  const { vue, onglet: ongletDemande, page } = await searchParams;
  if (ongletDemande === "collective") {
    const { count } = await supabase.from("imports_collective").select("application_id", { count: "exact", head: true });
    return (
      <div className="space-y-4">
        <h1 className="titre-page">Consultants</h1>
        <Onglets actif="collective" nombre={count} />
        <ListeCollective supabase={supabase} page={Math.max(0, Number(page) || 0)} />
      </div>
    );
  }
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
  return (
    <div className="space-y-4">
      <Onglets actif="tableau" />
      <TableauExcel vues={VUES} criteresInitiaux={criteres} premiere={premiere} ongletId={onglet.id} entetes={entetes} champs={champs} estAdmin={utilisateur.role === "admin"} />
    </div>
  );
}
