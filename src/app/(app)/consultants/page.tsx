import Link from "next/link";
import { exigerUtilisateur } from "@/lib/acces";
import { COLONNE_DOMAINE, champsParEntete } from "@/lib/import/excel";
import { lireTout } from "@/lib/supabase/pages";
import { lignesHorsExcel, type FicheHorsExcel } from "@/lib/tableau/hors-excel";
import type { LigneTableau } from "@/lib/tableau/modele";
import TableauExcel from "./tableau-excel";

export default async function TableauDeSuivi({ searchParams }: { searchParams: Promise<{ domaine?: string }> }) {
  const { utilisateur, supabase } = await exigerUtilisateur();
  const { domaine } = await searchParams;
  // Un seul onglet (le principal) ; les vues par domaine sont calculées dans le navigateur depuis la colonne « Domaine ».
  const { data: onglets } = await supabase.from("tableau_onglets").select("id, nom, entetes, principal").order("principal", { ascending: false }).order("position");

  if (!onglets?.length) {
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

  const onglet = onglets[0];
  // Toutes les lectures en même temps (et chacune par pages parallèles) : l'écran s'affiche en une fois.
  const [lignes, horsExcel, docs, competences] = await Promise.all([
    lireTout<LigneTableau>((a, b) => supabase.from("tableau_lignes").select("id, position, consultant_id, valeurs").eq("onglet_id", onglet.id).order("position").range(a, b)),
    supabase.from("consultants").select("*").neq("source", "import_excel").order("created_at", { ascending: false }).then((r) => r.data ?? []),
    lireTout<{ consultant_id: string; type: string; url_web: string | null }>((a, b) => supabase.from("documents").select("consultant_id, type, url_web")
      .not("consultant_id", "is", null).eq("supprime_sharepoint", false).in("type", ["word_nominatif", "pdf_anonyme"])
      .order("modifie_sharepoint_le", { ascending: false }).range(a, b)),
    lireTout<{ consultant_id: string; competences: string }>((a, b) => supabase.from("competences_par_consultant").select("consultant_id, competences").range(a, b)),
  ]);

  // Fiches créées hors Excel (emails, CV SharePoint) : en haut du tableau, les plus récentes d'abord.
  const relies = new Set(lignes.map((l) => l.consultant_id).filter(Boolean));
  lignes.unshift(...lignesHorsExcel(
    horsExcel.filter((c) => !relies.has(c.id)) as FicheHorsExcel[],
    onglet.entetes,
    Math.max(0, ...lignes.map((l) => l.position)) + 1,
  ));
  // Compétences du CV analysé : cherchables depuis la barre de recherche (« java paris »).
  const parConsultant = new Map(competences.map((c) => [c.consultant_id, c.competences]));
  for (const l of lignes) if (l.consultant_id && parConsultant.has(l.consultant_id)) l.recherche = parConsultant.get(l.consultant_id);

  const domaines = [...new Set(lignes.flatMap((l) => (l.valeurs[COLONNE_DOMAINE] ?? "").split(" ; ").filter(Boolean)))].sort((a, b) => a.localeCompare(b, "fr"));

  // Liens SharePoint (Word Unitech, PDF anonymisé le plus récent) des fiches reliées.
  const documents: Record<string, { word?: string; pdf?: string }> = {};
  for (const d of docs) {
    const e = (documents[d.consultant_id] ??= {});
    if (d.type === "word_nominatif" && !e.word) e.word = d.url_web ?? undefined;
    if (d.type === "pdf_anonyme" && !e.pdf) e.pdf = d.url_web ?? undefined;
  }

  return (
    <TableauExcel
      vues={[{ cle: "", nom: "Tous" }, ...domaines.map((d) => ({ cle: d, nom: d }))]}
      vueInitiale={domaine ?? ""}
      colonneDomaine={COLONNE_DOMAINE}
      ongletId={onglet.id}
      entetes={onglet.entetes}
      champs={onglet.principal ? champsParEntete(onglet.entetes, onglet.entetes) : {}}
      lignes={lignes}
      estAdmin={utilisateur.role === "admin"}
      documents={documents}
    />
  );
}
