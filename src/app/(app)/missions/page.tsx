import Link from "next/link";
import { exigerUtilisateur } from "@/lib/acces";
import { FILTRE_MES_MISSIONS, responsablesPossibles } from "@/lib/missions/responsables";
import { IconeMallette } from "../icones";
import ListeMissions, { type CarteMission } from "./liste";

const ONGLETS = [["ouverte", "Ouvertes"], ["pourvue", "Pourvues"], ["fermee", "Fermées"]] as const;

/** Missions : onglets par statut (avec leur nombre), recherche, « Mes missions », une carte par mission. */
export default async function Missions({ searchParams }: { searchParams: Promise<{ statut?: string; vue?: string }> }) {
  const { utilisateur, supabase } = await exigerUtilisateur();
  const { statut = "ouverte", vue = "miennes" } = await searchParams;
  const miennes = vue !== "toutes";
  const compter = (s: string) => {
    let q = supabase.from("missions").select("id", { count: "exact", head: true }).eq("statut", s);
    if (miennes) q = q.or(FILTRE_MES_MISSIONS(utilisateur.id));
    return q.then((r) => r.count ?? 0);
  };
  let q = supabase.from("missions")
    .select("id, client, intitule, statut, created_at, date_debut, localisation, responsable_id, propositions(statut)")
    .eq("statut", statut).order("created_at", { ascending: false }).limit(300);
  if (miennes) q = q.or(FILTRE_MES_MISSIONS(utilisateur.id));
  const [{ data }, responsables, ...nombres] = await Promise.all([q, responsablesPossibles(supabase), ...ONGLETS.map(([s]) => compter(s))]);

  const missions: CarteMission[] = (data ?? []).map((m) => {
    const p = (m.propositions ?? []) as { statut: string }[];
    const n = (s: string) => p.filter((x) => x.statut === s).length;
    return {
      id: m.id, intitule: m.intitule, client: m.client, localisation: m.localisation, creeLe: m.created_at, debut: m.date_debut,
      responsableId: m.responsable_id, suivis: p.length, appeles: n("appele"), envoyes: n("envoye_client"), retenus: n("retenu"),
    };
  });
  const lien = (s: string, v: string) => `/missions?statut=${s}&vue=${v}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-nuit">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-marque-600 shadow-sm ring-1 ring-slate-200"><IconeMallette className="h-5 w-5" /></span>
          Missions
        </h1>
        <Link href="/missions/nouvelle" className="bouton-primaire px-5 py-2.5">+ Nouvelle mission</Link>
      </div>

      {/* Onglets par statut */}
      <nav className="flex gap-6 border-b border-slate-200/80">
        {ONGLETS.map(([s, libelle], i) => (
          <Link key={s} href={lien(s, vue)} className={`-mb-px flex items-center gap-2 border-b-2 px-1 pb-3 text-[15px] font-semibold transition ${s === statut ? "border-marque-600 text-nuit" : "border-transparent text-slate-500 hover:text-nuit"}`}>
            {libelle}
            <span className={`rounded-md px-1.5 py-0.5 text-xs font-bold ${s === statut ? "bg-marque-50 text-marque-700" : "bg-slate-100 text-slate-500"}`}>{nombres[i]}</span>
          </Link>
        ))}
      </nav>

      <ListeMissions missions={missions} titre={`Missions ${ONGLETS.find(([s]) => s === statut)?.[1].toLowerCase() ?? ""}`}
        responsables={responsables} estAdmin={utilisateur.role === "admin"}
        lienVue={{ miennes: lien(statut, "miennes"), toutes: lien(statut, "toutes") }} miennes={miennes} />
    </div>
  );
}
