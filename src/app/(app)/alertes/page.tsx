import Link from "next/link";
import { exigerUtilisateur } from "@/lib/acces";
import { traiterAlerte } from "@/lib/alertes/actions";
import { detailAlerte, LIBELLES_ALERTES } from "@/lib/alertes/libelles";

export default async function Alertes({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { supabase } = await exigerUtilisateur();
  const { type } = await searchParams;
  let q = supabase.from("alertes").select("id, type, details, created_at, consultant_id, consultants(prenom, nom, trigramme)")
    .eq("statut", "ouverte").order("created_at", { ascending: false }).limit(300);
  if (type) q = q.eq("type", type);
  const [{ data: alertes }, { data: toutes }] = await Promise.all([q, supabase.from("alertes").select("type").eq("statut", "ouverte")]);
  const parType = new Map<string, number>();
  for (const a of toutes ?? []) parType.set(a.type, (parType.get(a.type) ?? 0) + 1);

  return (
    <div className="space-y-4">
      <h1 className="titre-page">Cas à vérifier</h1>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/alertes" className={`rounded-full px-3 py-1 ring-1 ring-zinc-300 ${!type ? "bg-marque-600 text-white ring-marque-600" : "bg-white"}`}>Tous ({toutes?.length ?? 0})</Link>
        {[...parType].sort((a, b) => b[1] - a[1]).map(([t, n]) => (
          <Link key={t} href={`/alertes?type=${t}`} className={`rounded-full px-3 py-1 ring-1 ring-zinc-300 ${type === t ? "bg-marque-600 text-white ring-marque-600" : "bg-white"}`}>
            {LIBELLES_ALERTES[t] ?? t} ({n})
          </Link>
        ))}
      </div>
      <div className="carte overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-zinc-500"><tr><th className="p-3">Cas</th><th className="p-3">Fiche</th><th className="p-3">Détail</th><th className="p-3"></th></tr></thead>
          <tbody>
            {(alertes ?? []).map((a) => {
              const c = a.consultants as unknown as { prenom: string; nom: string; trigramme: string } | null;
              return (
                <tr key={a.id} className="border-t border-zinc-100 align-top">
                  <td className="p-3"><span className="pastille pastille-orange">{LIBELLES_ALERTES[a.type] ?? a.type}</span></td>
                  <td className="p-3">{c ? <Link href={`/consultants/${a.consultant_id}`} className="font-medium text-marque-700 hover:underline">{c.prenom} {c.nom} <span className="font-mono text-xs text-zinc-500">{c.trigramme}</span></Link> : "—"}</td>
                  <td className="p-3 text-zinc-600">{detailAlerte(a.details as Record<string, unknown>)}</td>
                  <td className="whitespace-nowrap p-3 text-right">
                    <form action={traiterAlerte} className="inline">
                      <input type="hidden" name="id" value={a.id} /><input type="hidden" name="statut" value="resolue" />
                      <button className="bouton-secondaire">Résolu</button>
                    </form>{" "}
                    <form action={traiterAlerte} className="inline">
                      <input type="hidden" name="id" value={a.id} /><input type="hidden" name="statut" value="ignoree" />
                      <button className="bouton-secondaire">Ignorer</button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {!alertes?.length && <tr><td colSpan={4} className="p-6 text-center text-zinc-500">Aucun cas à vérifier.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
