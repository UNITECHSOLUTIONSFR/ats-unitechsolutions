import Link from "next/link";
import { exigerUtilisateur } from "@/lib/acces";

const LIBELLES: Record<string, string> = { ouverte: "Ouverte", pourvue: "Pourvue", fermee: "Fermée" };

export default async function Missions({ searchParams }: { searchParams: Promise<{ statut?: string }> }) {
  const { supabase } = await exigerUtilisateur();
  const { statut = "ouverte" } = await searchParams;
  let q = supabase.from("missions").select("id, client, intitule, statut, created_at, propositions(count)").order("created_at", { ascending: false }).limit(200);
  if (statut !== "toutes") q = q.eq("statut", statut);
  const { data: missions } = await q;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="titre-page">Missions</h1>
        <Link href="/missions/nouvelle" className="bouton-primaire">+ Nouvelle mission</Link>
      </div>
      <div className="flex gap-2 text-sm">
        {["ouverte", "pourvue", "fermee", "toutes"].map((s) => (
          <Link key={s} href={`/missions?statut=${s}`}
            className={`rounded-full px-3 py-1 ring-1 ring-zinc-300 ${s === statut ? "bg-marque-600 text-white ring-marque-600" : "bg-white"}`}>
            {LIBELLES[s] ?? "Toutes"}
          </Link>
        ))}
      </div>
      <div className="overflow-x-auto carte">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-zinc-500">
            <tr><th className="p-3">Intitulé</th><th className="p-3">Client</th><th className="p-3">Statut</th><th className="p-3">Suivis</th><th className="p-3">Créée le</th></tr>
          </thead>
          <tbody>
            {(missions ?? []).map((m) => (
              <tr key={m.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                <td className="p-3"><Link href={`/missions/${m.id}`} className="font-medium hover:underline">{m.intitule}</Link></td>
                <td className="p-3">{m.client ?? "—"}</td>
                <td className="p-3">{LIBELLES[m.statut]}</td>
                <td className="p-3">{(m.propositions as { count: number }[])?.[0]?.count ?? 0}</td>
                <td className="p-3">{new Date(m.created_at).toLocaleDateString("fr-FR")}</td>
              </tr>
            ))}
            {!missions?.length && <tr><td colSpan={5} className="p-6 text-center text-zinc-500">Aucune mission.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
