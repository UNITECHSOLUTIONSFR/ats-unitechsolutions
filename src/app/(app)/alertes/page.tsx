import Link from "next/link";
import { exigerUtilisateur } from "@/lib/acces";
import { traiterAlertes } from "@/lib/alertes/actions";
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
        <Link href="/alertes" className={`rounded-full px-3 py-1 font-medium transition ${!type ? "bg-nuit text-white shadow-md" : "bg-white/60 text-slate-600 ring-1 ring-white/80 hover:bg-white"}`}>Tous ({toutes?.length ?? 0})</Link>
        {[...parType].sort((a, b) => b[1] - a[1]).map(([t, n]) => (
          <Link key={t} href={`/alertes?type=${t}`} className={`rounded-full px-3 py-1 font-medium transition ${type === t ? "bg-nuit text-white shadow-md" : "bg-white/60 text-slate-600 ring-1 ring-white/80 hover:bg-white"}`}>
            {LIBELLES_ALERTES[t] ?? t} ({n})
          </Link>
        ))}
      </div>
      <form action={traiterAlertes} className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">Cochez des lignes puis :</span>
        <button name="action" value="resolue:selection" className="bouton-secondaire">Marquer résolus</button>
        <button name="action" value="ignoree:selection" className="bouton-secondaire">Ignorer</button>
      </div>
      <div className="carte overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white/50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="w-10 p-3"></th><th className="p-3">Cas</th><th className="p-3">Fiche</th><th className="p-3">Détail</th><th className="p-3"></th></tr></thead>
          <tbody>
            {(alertes ?? []).map((a) => {
              const c = a.consultants as unknown as { prenom: string; nom: string; trigramme: string } | null;
              return (
                <tr key={a.id} className="border-t border-white/70 align-top">
                  <td className="p-3"><input type="checkbox" name="ids" value={a.id} className="accent-marque-600" aria-label="Sélectionner" /></td>
                  <td className="p-3"><span className="pastille pastille-orange">{LIBELLES_ALERTES[a.type] ?? a.type}</span></td>
                  <td className="p-3">{c ? <Link href={`/consultants/${a.consultant_id}`} className="font-medium text-marque-700 hover:underline">{c.prenom} {c.nom} <span className="font-mono text-xs text-zinc-500">{c.trigramme}</span></Link> : "—"}</td>
                  <td className="p-3 text-zinc-600">{detailAlerte(a.details as Record<string, unknown>)}</td>
                  <td className="whitespace-nowrap p-3 text-right">
                    <button name="action" value={`resolue:${a.id}`} className="bouton-secondaire">Résolu</button>{" "}
                    <button name="action" value={`ignoree:${a.id}`} className="bouton-secondaire">Ignorer</button>
                  </td>
                </tr>
              );
            })}
            {!alertes?.length && <tr><td colSpan={5} className="p-6 text-center text-zinc-500">Aucun cas à vérifier.</td></tr>}
          </tbody>
        </table>
      </div>
      </form>
    </div>
  );
}
