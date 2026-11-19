import Link from "next/link";
import { exigerUtilisateur } from "@/lib/acces";
import { kanbanMissions } from "@/lib/missions/kanban";
import { IconeMallette } from "../../icones";

export const metadata = { title: "Missions · Kanban" };

/** Vue Kanban des missions : les mêmes colonnes que Trello, dans le même ordre, avec l'avancement de chaque mission. */
export default async function KanbanMissions() {
  const { supabase } = await exigerUtilisateur();
  const { colonnes, trelloLu } = await kanbanMissions(supabase);
  const total = colonnes.reduce((n, c) => n + c.cartes.length, 0);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-nuit">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-marque-600 shadow-sm ring-1 ring-slate-200"><IconeMallette className="h-5 w-5" /></span>
          Missions · Kanban
        </h1>
        <div className="flex items-center gap-2">
          <Link href="/missions" className="bouton-secondaire">Vue liste</Link>
        </div>
      </div>
      <p className="text-sm text-slate-500">
        {total} mission(s), rangées dans les mêmes colonnes que le tableau Trello. Trello fait foi : déplacez une carte dans Trello, elle change de colonne ici à la lecture suivante (toutes les heures, ou « Actualiser depuis Trello »).
        {!trelloLu && " Trello ne répond pas : colonnes reconstituées à partir des missions."}
      </p>
      <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6">
        <div className="flex min-w-max gap-4">
          {colonnes.map((col) => (
            <section key={col.nom} className="flex w-72 shrink-0 flex-col rounded-2xl bg-slate-100/80 p-3 ring-1 ring-slate-200/70">
              <h2 className="mb-2 flex items-center justify-between gap-2 px-1 text-sm font-bold text-nuit">
                <span className="truncate" title={col.nom}>{col.nom}</span>
                <span className="pastille">{col.cartes.length}</span>
              </h2>
              <div className="space-y-2">
                {col.cartes.map((m) => (
                  <Link key={m.id} href={`/missions/${m.id}`} className="block rounded-xl bg-white p-3 text-sm shadow-sm ring-1 ring-slate-200 transition hover:ring-marque-300">
                    <div className="font-semibold leading-snug text-nuit">{m.intitule}</div>
                    {m.client && <div className="mt-0.5 text-xs text-slate-500">{m.client}</div>}
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                      {m.recruteur && <span className="pastille">{m.recruteur}</span>}
                      <span className={`pastille ${m.pertinents > 0 ? "pastille-vert" : ""}`}>{m.pertinents} pertinent(s)</span>
                      {m.suivis > 0 && <span className="pastille">{m.suivis} suivi(s)</span>}
                      {m.appeles > 0 && <span className="pastille">{m.appeles} appelé(s)</span>}
                      {m.envoyes > 0 && <span className="pastille pastille-orange">{m.envoyes} envoyé(s)</span>}
                      {m.retenus > 0 && <span className="pastille pastille-vert">{m.retenus} retenu(s)</span>}
                    </div>
                  </Link>
                ))}
                {!col.cartes.length && <p className="px-1 py-2 text-xs text-slate-400">Aucune mission</p>}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
