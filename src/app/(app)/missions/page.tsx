import Link from "next/link";
import { exigerUtilisateur } from "@/lib/acces";
import { FILTRE_MES_MISSIONS, responsablesPossibles } from "@/lib/missions/responsables";
import ChoixResponsable from "./responsable";

const LIBELLES: Record<string, string> = { ouverte: "Ouverte", pourvue: "Pourvue", fermee: "Fermée" };
const LIBELLES_PLURIEL: Record<string, string> = { ouverte: "Ouvertes", pourvue: "Pourvues", fermee: "Fermées", toutes: "Tous statuts" };

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="titre-page">Missions</h1>
        <Link href="/missions/nouvelle" className="bouton-primaire">+ Nouvelle mission</Link>
      </div>
      {/* Filtres : à qui sont les missions, puis leur statut */}
      <div className="carte flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 text-sm">
        <Groupe libelle="Afficher">
          <Choix href={lien(statut, "miennes")} actif={vue !== "toutes"}>Mes missions</Choix>
          <Choix href={lien(statut, "toutes")} actif={vue === "toutes"}>Toutes les missions</Choix>
        </Groupe>
        <span className="hidden h-6 w-px bg-slate-200 sm:block" />
        <Groupe libelle="Statut">
          {["ouverte", "pourvue", "fermee", "toutes"].map((s) => (
            <Choix key={s} href={lien(s, vue)} actif={s === statut}>{LIBELLES_PLURIEL[s]}</Choix>
          ))}
        </Groupe>
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

function Groupe({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold text-slate-400">{libelle}</span>
      <div className="flex flex-wrap gap-1 rounded-full bg-slate-100/80 p-1">{children}</div>
    </div>
  );
}

function Choix({ href, actif, children }: { href: string; actif: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={`rounded-full px-3.5 py-1 font-medium transition ${actif ? "bg-white text-nuit shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-nuit"}`}>
      {children}
    </Link>
  );
}
