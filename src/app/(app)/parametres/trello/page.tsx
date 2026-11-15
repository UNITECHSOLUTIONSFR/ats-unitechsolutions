import { exigerAdmin } from "@/lib/acces-admin";
import { clientSupabaseAdmin } from "@/lib/supabase/admin";
import { trelloConfigure } from "@/lib/trello/client";
import { synchroniserTrello, type PlanCarte } from "@/lib/trello/synchro";
import { LIBELLE_STATUT } from "@/lib/missions/statuts";

export const metadata = { title: "Trello" };
export const dynamic = "force-dynamic";

const ACTIONS: Record<PlanCarte["action"], [string, string]> = {
  creer: ["Nouvelle mission", "bg-emerald-50 text-emerald-700 ring-emerald-200"],
  relier: ["Reliée à une mission existante", "bg-sky-50 text-sky-700 ring-sky-200"],
  mettre_a_jour: ["Mise à jour", "bg-marque-50 text-marque-700 ring-marque-100"],
  inchangee: ["Inchangée", "bg-slate-50 text-slate-500 ring-slate-200"],
};

/**
 * Aperçu de la lecture du tableau Trello : ce que l'outil fait de chaque carte (statut, recruteur, client, TJM interne,
 * mission reliée ou créée). Simulation : rien n'est enregistré et l'IA n'est pas appelée.
 */
export default async function PageTrello() {
  await exigerAdmin();
  if (!trelloConfigure()) return <p className="carte p-6 text-sm text-red-700">Clé Trello absente : saisissez TRELLO_API_KEY et TRELLO_TOKEN dans Vercel.</p>;
  let bilan;
  try {
    bilan = await synchroniserTrello(clientSupabaseAdmin(), { simulation: true });
  } catch (e) {
    return <p className="carte p-6 text-sm text-red-700">Lecture de Trello impossible : {(e as Error).message}</p>;
  }
  const rang = { relier: 0, creer: 1, mettre_a_jour: 2, inchangee: 3 } as const;
  const plan = [...(bilan.plan ?? [])].sort((a, b) => rang[a.action] - rang[b.action]);
  const parStatut = Object.entries(plan.reduce<Record<string, number>>((t, p) => ({ ...t, [p.statut]: (t[p.statut] ?? 0) + 1 }), {}));
  const aLire = plan.filter((p) => p.analyseIA).length;
  return (
    <div className="space-y-5">
      <div className="carte space-y-3 p-5 text-sm">
        <p className="text-slate-600">
          <b>Aperçu, rien n&apos;est enregistré.</b> Voici ce que l&apos;outil ferait de chaque carte du tableau Trello (lecture seule, jamais d&apos;écriture dans Trello).
          Seules les cartes de <b>« Missions en cours »</b> entrent dans l&apos;outil ; une carte déjà importée est ensuite suivie dans toutes les colonnes.
          Les missions déjà créées dans l&apos;outil sont reliées à leur carte (en bleu ci-dessous) : vérifiez chaque lien.
        </p>
        <div className="flex flex-wrap gap-2">
          <span className="pastille">{plan.length} carte(s) lue(s)</span>
          {parStatut.map(([s, n]) => <span key={s} className="pastille">{LIBELLE_STATUT[s] ?? s} : {n}</span>)}
          <span className="pastille pastille-vert">{bilan.creees} nouvelle(s)</span>
          <span className="pastille">{bilan.reliees} reliée(s) à une mission existante</span>
          <span className="pastille pastille-orange">{aLire} à lire par l&apos;IA ≈ {(aLire * 0.005).toFixed(2)} $</span>
        </div>
        {bilan.erreurs.length > 0 && <p className="text-red-700">{bilan.erreurs.slice(0, 5).join(" ; ")}</p>}
      </div>
      <div className="carte overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>{["Carte Trello", "Colonne → statut", "Client", "Intitulé", "TJM (interne)", "Fiche de poste", "Dans l'outil"].map((t) => <th key={t} className="px-4 py-3 font-semibold">{t}</th>)}</tr>
          </thead>
          <tbody>
            {plan.map((p) => (
              <tr key={p.url} className="border-t border-slate-100 align-top">
                <td className="px-4 py-2.5"><a href={p.url} target="_blank" rel="noreferrer" className="lien">{p.carte}</a></td>
                <td className="px-4 py-2.5 text-slate-600">{p.colonne} → <b className="text-nuit">{LIBELLE_STATUT[p.statut] ?? p.statut}</b>{p.recruteur && <> · {p.recruteur}</>}</td>
                <td className="px-4 py-2.5">{p.client ?? <span className="text-slate-400">lu dans la description</span>}</td>
                <td className="px-4 py-2.5">{p.intitule}</td>
                <td className="px-4 py-2.5 text-amber-800">{p.tjm ?? <span className="text-slate-400">—</span>}</td>
                <td className="px-4 py-2.5 text-slate-600">{p.pieceJointe ?? <span className="text-slate-400">description seule</span>}</td>
                <td className="px-4 py-2.5">
                  <span className={`pastille ${ACTIONS[p.action][1]}`}>{ACTIONS[p.action][0]}</span>
                  {p.missionReliee && <div className="mt-1 text-xs text-slate-500">« {p.missionReliee} »</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
