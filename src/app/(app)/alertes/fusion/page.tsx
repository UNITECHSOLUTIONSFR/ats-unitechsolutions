import Link from "next/link";
import { notFound } from "next/navigation";
import { exigerAdmin } from "@/lib/acces-admin";
import { fusionnerFiches } from "@/lib/consultants/actions";
import { formaterTelephone } from "@/lib/metier/telephone";

const CHAMPS: [string, string][] = [
  ["prenom", "Prénom"], ["nom", "Nom"], ["trigramme", "Trigramme"], ["email", "Email"], ["email_2", "Email 2"], ["telephone_e164", "Téléphone"],
  ["intitule_poste", "Poste"], ["localisation", "Localisation"], ["disponibilite", "Disponibilité"], ["disponible_le", "Disponible le"],
  ["statut", "Statut"], ["linkedin", "LinkedIn"], ["tjm_salaire", "TJM / salaire"], ["experience", "Expérience"], ["notes", "Notes"],
];

/** Doublon possible : les deux fiches côte à côte ; on choisit la valeur à garder pour chaque champ, puis on fusionne. */
export default async function Fusion({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const { supabase } = await exigerAdmin();
  const { a, b } = await searchParams;
  if (!a || !b || a === b) notFound();
  const [{ data: fiches }, ...comptes] = await Promise.all([
    supabase.from("consultants").select("*").in("id", [a, b]),
    ...[a, b].flatMap((id) => [
      supabase.from("documents").select("id", { count: "exact", head: true }).eq("consultant_id", id),
      supabase.from("propositions").select("id", { count: "exact", head: true }).eq("consultant_id", id),
    ]),
  ]);
  const A = fiches?.find((f) => f.id === a), B = fiches?.find((f) => f.id === b);
  if (!A || !B) return <div className="carte p-8 text-center text-slate-500">L&apos;une des deux fiches n&apos;existe plus (déjà fusionnée ou supprimée). <Link href="/alertes" className="lien">Retour aux cas à vérifier</Link></div>;
  // On garde par défaut la fiche la plus ancienne (souvent celle de l'Excel).
  const [garde, autre] = new Date(A.created_at) <= new Date(B.created_at) ? [A, B] : [B, A];
  const n = (i: number) => comptes[i].count ?? 0;
  const [docsG, propsG, docsA, propsA] = garde.id === a ? [n(0), n(1), n(2), n(3)] : [n(2), n(3), n(0), n(1)];
  const aff = (k: string, v: unknown) => (v === null || v === undefined || v === "" ? "" : k === "telephone_e164" ? formaterTelephone(String(v)) : String(v));

  return (
    <form action={fusionnerFiches} className="space-y-4">
      <div>
        <h1 className="titre-page">Fusionner deux fiches</h1>
        <p className="sous-titre mt-1">Pour chaque ligne, cochez la valeur à garder. Documents, compétences, missions, lignes du tableau et historique sont réunis sur une seule fiche ; l&apos;autre est supprimée (suppression tracée).</p>
      </div>
      <input type="hidden" name="garde" value={garde.id} />
      <input type="hidden" name="supprime" value={autre.id} />
      <div className="carte overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white/50 text-left text-xs font-semibold text-slate-500">
            <tr>
              <th className="p-3">Champ</th>
              <th className="p-3">Fiche gardée · <Link href={`/consultants/${garde.id}`} className="lien">ouvrir</Link> <span className="font-normal">({docsG} document(s), {propsG} mission(s))</span></th>
              <th className="p-3">Fiche fusionnée · <Link href={`/consultants/${autre.id}`} className="lien">ouvrir</Link> <span className="font-normal">({docsA} document(s), {propsA} mission(s))</span></th>
            </tr>
          </thead>
          <tbody>
            {CHAMPS.map(([k, libelle]) => {
              const g = aff(k, garde[k]), o = aff(k, autre[k]);
              const differents = g !== o;
              return (
                <tr key={k} className={`border-t border-white/70 ${differents ? "" : "text-slate-400"}`}>
                  <td className="p-3 font-medium text-nuit">{libelle}</td>
                  {differents ? (
                    <>
                      <td className="p-3"><label className="flex items-center gap-2"><input type="radio" name={`champ:${k}`} value="garde" defaultChecked={!!g || !o} className="accent-marque-600" />{g || <em className="text-slate-400">vide</em>}</label></td>
                      <td className="p-3"><label className="flex items-center gap-2"><input type="radio" name={`champ:${k}`} value="autre" defaultChecked={!g && !!o} className="accent-marque-600" />{o || <em className="text-slate-400">vide</em>}
                        <input type="hidden" name={`valeur:${k}`} value={autre[k] ?? ""} /></label></td>
                    </>
                  ) : <td className="p-3" colSpan={2}>{g || "—"} <span className="text-xs">(identique)</span></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between">
        <Link href="/alertes" className="bouton-secondaire">Annuler</Link>
        <button className="bouton-primaire px-6 py-2.5">Fusionner les deux fiches</button>
      </div>
    </form>
  );
}
