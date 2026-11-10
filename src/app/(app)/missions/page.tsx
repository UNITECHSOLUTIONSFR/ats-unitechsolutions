import Link from "next/link";
import { exigerUtilisateur } from "@/lib/acces";
import { FILTRE_MES_MISSIONS, responsablesPossibles } from "@/lib/missions/responsables";
import ChoixResponsable from "./responsable";

const LIBELLES: Record<string, string> = { ouverte: "Ouverte", pourvue: "Pourvue", fermee: "Fermée" };

export default async function Missions({ searchParams }: { searchParams: Promise<{ statut?: string; vue?: string }> }) {
  const { utilisateur, supabase } = await exigerUtilisateur();
  const { statut = "ouverte", vue = "miennes" } = await searchParams;
  let q = supabase.from("missions").select("id, client, intitule, statut, created_at, responsable_id, propositions(count)").order("created_at", { ascending: false }).limit(200);
  if (statut !== "toutes") q = q.eq("statut", statut);
  // Par défaut : mes missions et celles à assigner ; « Toutes » montre aussi celles des autres.
  if (vue !== "toutes") q = q.or(FILTRE_MES_MISSIONS(utilisateur.id));
  const [{ data: missions }, responsables] = await Promise.all([q, responsablesPossibles(supabase)]);
  const estAdmin = utilisateur.role === "admin";
  const lien = (s: string, v: string) => `/missions?statut=${s}&vue=${v}`;
  const pastille = (actif: boolean) => `rounded-full px-3.5 py-1.5 font-medium transition ${actif ? "bg-nuit text-white shadow-md" : "text-slate-600 hover:bg-white"}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="titre-page">Missions</h1>
        <Link href="/missions/nouvelle" className="bouton-primaire">+ Nouvelle mission</Link>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div className="verre flex gap-1 rounded-full p-1">
          <Link href={lien(statut, "miennes")} className={pastille(vue !== "toutes")}>Mes missions</Link>
          <Link href={lien(statut, "toutes")} className={pastille(vue === "toutes")}>Toutes les missions</Link>
        </div>
        <div className="verre flex gap-1 rounded-full p-1">
          {["ouverte", "pourvue", "fermee", "toutes"].map((s) => (
            <Link key={s} href={lien(s, vue)} className={pastille(s === statut)}>{LIBELLES[s] ?? "Tous statuts"}</Link>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto carte">
        <table className="w-full text-sm">
          <thead className="bg-white/50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr><th className="p-3">Intitulé</th><th className="p-3">Client</th><th className="p-3">Responsable</th><th className="p-3">Statut</th><th className="p-3">Suivis</th><th className="p-3">Créée le</th></tr>
          </thead>
          <tbody>
            {(missions ?? []).map((m) => (
              <tr key={m.id} className="border-t border-white/70 hover:bg-white/60">
                <td className="p-3"><Link href={`/missions/${m.id}`} className="font-semibold text-nuit hover:text-marque-600">{m.intitule}</Link></td>
                <td className="p-3">{m.client ?? "—"}</td>
                <td className="p-3"><ChoixResponsable missionId={m.id} responsableId={m.responsable_id} responsables={responsables} estAdmin={estAdmin} compact /></td>
                <td className="p-3">{LIBELLES[m.statut]}</td>
                <td className="p-3">{(m.propositions as { count: number }[])?.[0]?.count ?? 0}</td>
                <td className="p-3">{new Date(m.created_at).toLocaleDateString("fr-FR")}</td>
              </tr>
            ))}
            {!missions?.length && (
              <tr><td colSpan={6} className="p-6 text-center text-slate-500">
                {vue !== "toutes" ? <>Aucune mission pour vous. <Link href={lien(statut, "toutes")} className="lien">Voir toutes les missions</Link></> : "Aucune mission."}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
