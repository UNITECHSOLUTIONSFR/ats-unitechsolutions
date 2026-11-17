import Link from "next/link";
import { exigerUtilisateur } from "@/lib/acces";
import { FILTRE_MES_MISSIONS, responsablesPossibles } from "@/lib/missions/responsables";
import { IconeMallette } from "../icones";
import ListeMissions, { type CarteMission } from "./liste";
import { resumesMissions } from "@/lib/matching/stockage";
import { noteAffichee, type LigneClassement } from "@/lib/matching/classement";
import { JaugeScore } from "./evaluation";
import { STATUTS_MISSIONS } from "@/lib/missions/statuts";
import { BoutonActualiserTrello } from "./trello";

const ONGLETS = STATUTS_MISSIONS;

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
    .select("id, client, intitule, statut, created_at, date_debut, localisation, responsable_id, trello_carte_id, trello_colonne, trello_recruteur, trello_url, tjm, propositions(statut), mission_competences(obligatoire, importance, competences(nom_canonique))")
    .eq("statut", statut).order("created_at", { ascending: false }).limit(300);
  if (miennes) q = q.or(FILTRE_MES_MISSIONS(utilisateur.id));
  const derniereLecture = supabase.from("missions").select("trello_lu_le").not("trello_lu_le", "is", null).order("trello_lu_le", { ascending: false }).limit(1).maybeSingle()
    .then((r) => (r.data?.trello_lu_le as string | undefined) ?? null);
  const [{ data }, responsables, lu, ...nombres] = await Promise.all([q, responsablesPossibles(supabase), derniereLecture, ...ONGLETS.map(([s]) => compter(s))]);
  // Meilleur score et nombre de pertinents : lus en une fois dans les classements rangés (aucun calcul ici).
  const avecClassement = statut === "ouverte" || statut === "chez_client";
  const resumes = avecClassement ? await resumesMissions(supabase, (data ?? []).map((m) => m.id as string)) : new Map();

  const missions: CarteMission[] = (data ?? []).map((m) => {
    const p = (m.propositions ?? []) as { statut: string }[];
    const n = (s: string) => p.filter((x) => x.statut === s).length;
    return {
      id: m.id, intitule: m.intitule, client: m.client, localisation: m.localisation, creeLe: m.created_at, debut: m.date_debut,
      responsableId: m.responsable_id, suivis: p.length,
      competences: ((m.mission_competences ?? []) as unknown as { obligatoire: boolean; importance: number; competences: { nom_canonique: string } | null }[])
        .sort((a, b) => Number(b.obligatoire) - Number(a.obligatoire) || b.importance - a.importance).map((k) => k.competences?.nom_canonique).filter((x): x is string => !!x),
      trello: m.trello_carte_id ? { colonne: m.trello_colonne, recruteur: m.trello_recruteur, url: m.trello_url } : null, tjm: m.tjm, appeles: n("appele"), envoyes: n("envoye_client"), retenus: n("retenu"),
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
        {/* Les missions viennent de Trello (lu toutes les heures, en lecture seule) : plus de création dans l'outil. */}
        {utilisateur.role === "admin" ? <BoutonActualiserTrello derniereLecture={lu} />
          : lu && <span className="text-xs text-slate-500">Missions lues depuis Trello le {new Date(lu).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</span>}
      </div>

      {/* Onglets par statut */}
      <nav className="-mx-3 flex gap-5 overflow-x-auto border-b border-slate-200/80 px-3 sm:mx-0 sm:gap-6 sm:px-0">
        {ONGLETS.map(([s, libelle], i) => (
          <Link key={s} href={lien(s, vue)} className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-1 pb-3 text-[15px] font-semibold transition ${s === statut ? "border-marque-600 text-nuit" : "border-transparent text-slate-500 hover:text-nuit"}`}>
            {libelle}
            <span className={`rounded-md px-1.5 py-0.5 text-xs font-bold ${s === statut ? "bg-marque-50 text-marque-700" : "bg-slate-100 text-slate-500"}`}>{nombres[i]}</span>
          </Link>
        ))}
      </nav>

      <ListeMissions missions={missions} titre={`Missions ${ONGLETS.find(([s]) => s === statut)?.[1].toLowerCase() ?? ""}`}
        responsables={responsables} estAdmin={utilisateur.role === "admin"}
        lienVue={{ miennes: lien(statut, "miennes"), toutes: lien(statut, "toutes") }} miennes={miennes}
        pertinents={avecClassement ? Object.fromEntries(missions.map((m) => [m.id, <Pertinents key={m.id} missionId={m.id} n={resumes.get(m.id)?.pertinents ?? null} />])) : undefined}
        resumes={avecClassement ? Object.fromEntries(missions.map((m) => [m.id, <MeilleurScore key={m.id} premiers={resumes.get(m.id)?.premiers ?? []} />])) : undefined} />
    </div>
  );
}

/** Meilleur score de la mission (jauge) et trigrammes des 3 premiers profils : lus dans le classement rangé. */
function MeilleurScore({ premiers: tous }: { premiers: LigneClassement[] }) {
  const premiers = tous.filter((c) => !c.resultat.elimine && c.avisIA?.verdict !== "hors_sujet").slice(0, 3);
  if (!premiers.length) return null;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <JaugeScore score={noteAffichee(premiers[0])} petite sansLibelle />
      <div className="flex gap-1" title="Les 3 premiers profils">
        {premiers.map((c) => <span key={c.consultant_id} className="rounded-full bg-marque-50 px-1.5 py-0.5 text-[10px] font-bold tracking-tight text-marque-700">{c.trigramme || "?"}</span>)}
      </div>
    </div>
  );
}

/** Nombre de profils pertinents d'une mission ouverte (même règle que l'écran de la mission : non écartés, score ≥ 60). */
function Pertinents({ missionId, n: nombre }: { missionId: string; n: number | null }) {
  // Mission toute nouvelle, pas encore classée : le classement se prépare en arrière-plan.
  if (nombre === null) return <span className="text-xs text-slate-400">Classement en préparation…</span>;
  const n = nombre;
  return (
    <Link href={`/missions/${missionId}`} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ring-1 ${n ? "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100" : "bg-slate-50 text-slate-500 ring-slate-200"}`}>
      <span className="text-base font-bold tabular-nums">{n}</span> pertinent{n > 1 ? "s" : ""}
    </Link>
  );
}
