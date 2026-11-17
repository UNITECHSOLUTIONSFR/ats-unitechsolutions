import Link from "next/link";
import { exigerAdmin } from "@/lib/acces-admin";
import FormulaireFusionLignes from "./formulaire";

/** Fusion de deux lignes du tableau (n'importe lesquelles) : colonne par colonne, on choisit ou saisit la valeur à garder. */
export default async function FusionLignes({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const { supabase } = await exigerAdmin();
  const { a, b } = await searchParams;
  const { data: lignes } = a && b && a !== b ? await supabase.from("tableau_lignes").select("id, onglet_id, position, valeurs").in("id", [a, b]) : { data: [] };
  const A = lignes?.find((l) => l.id === a), B = lignes?.find((l) => l.id === b);
  if (!A || !B) return <div className="carte p-8 text-center text-slate-500">L&apos;une des deux lignes n&apos;existe plus. <Link href="/consultants" className="lien">Retour au tableau</Link></div>;
  const { data: onglet } = await supabase.from("tableau_onglets").select("entetes").eq("id", A.onglet_id).maybeSingle();
  const entetes = (onglet?.entetes as string[]) ?? [];
  const va = A.valeurs as Record<string, string>, vb = B.valeurs as Record<string, string>;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="titre-page">Fusionner deux lignes</h1>
        <p className="sous-titre mt-1">Pour chaque colonne, cliquez sur la valeur à garder ou saisissez-la. La ligne {A.position} est gardée avec ces valeurs ; la ligne {B.position} est retirée du tableau et vidée dans le fichier Excel de suivi.</p>
      </div>
      <FormulaireFusionLignes gardeId={A.id} videeId={B.id} positions={[A.position, B.position]}
        colonnes={entetes.map((e) => ({ entete: e, garde: va[e] ?? "", autre: vb[e] ?? "" }))} />
    </div>
  );
}
