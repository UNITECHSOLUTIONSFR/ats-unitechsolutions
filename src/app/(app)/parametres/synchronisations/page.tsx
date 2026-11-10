import { exigerAdmin } from "@/lib/acces-admin";
import { resumerRapport } from "@/lib/sync/resume";
import { TACHES } from "@/lib/sync/taches";
import { classePastille } from "@/lib/statuts";
import BoutonTache from "./bouton";

export const maxDuration = 300;

const QUAND: Record<string, string> = { excel: "chaque nuit à 2 h", cv: "chaque nuit à 2 h 30", emails: "toutes les heures" };

export default async function Synchronisations() {
  const { supabase } = await exigerAdmin();
  const { data: executions } = await supabase
    .from("executions").select("type, debut, fin, statut, rapport")
    .in("type", Object.values(TACHES).map((t) => t.type)).order("debut", { ascending: false }).limit(30);

  return (
    <div className="max-w-5xl space-y-4">
      <p className="text-zinc-600">Ces traitements tournent seuls. Vous pouvez aussi les lancer tout de suite.</p>
      <div className="grid gap-3 md:grid-cols-3">
        {(Object.keys(TACHES) as (keyof typeof TACHES)[]).map((nom) => (
          <div key={nom} className="carte space-y-2 p-4">
            <div className="font-semibold">{TACHES[nom].libelle}</div>
            <div className="text-sm text-zinc-500">Automatique : {QUAND[nom]}</div>
            <BoutonTache tache={nom} />
          </div>
        ))}
      </div>
      <div className="carte overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white/50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="p-3">Début</th><th className="p-3">Traitement</th><th className="p-3">État</th><th className="p-3">Résultat</th></tr></thead>
          <tbody>
            {(executions ?? []).map((e, i) => (
              <tr key={i} className="border-t border-white/70 align-top">
                <td className="whitespace-nowrap p-3">{new Date(e.debut).toLocaleString("fr-FR")}</td>
                <td className="p-3">{Object.values(TACHES).find((t) => t.type === e.type)?.libelle}</td>
                <td className="p-3"><span className={classePastille(e.statut === "termine" ? "disponible" : e.statut === "echec" ? "alerte" : "en cours")}>{e.statut}</span></td>
                <td className="p-3">{resumerRapport(e.type, e.rapport as Record<string, unknown>)}</td>
              </tr>
            ))}
            {!executions?.length && <tr><td colSpan={4} className="p-6 text-center text-zinc-500">Aucun traitement pour l&apos;instant.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
