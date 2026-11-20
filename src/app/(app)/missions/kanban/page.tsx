import Link from "next/link";
import { exigerUtilisateur } from "@/lib/acces";
import { kanbanMissions } from "@/lib/missions/kanban";
import { IconeMallette } from "../../icones";
import { TableauKanban } from "./tableau-kanban";

export const metadata = { title: "Missions · Kanban" };

/** Vue Kanban des missions : les mêmes colonnes que Trello, dans le même ordre, avec l'avancement de chaque mission ; glisser une carte la déplace aussi dans Trello. */
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
        {total} mission(s), rangées dans les mêmes colonnes que le tableau Trello. Glissez une carte vers une autre colonne : elle est aussi déplacée dans Trello. Une carte déplacée dans Trello change de colonne ici à la lecture suivante (toutes les heures, ou « Actualiser depuis Trello »).
        {!trelloLu && " Trello ne répond pas : colonnes reconstituées à partir des missions, déplacement impossible pour l'instant."}
      </p>
      <TableauKanban colonnes={colonnes} deplacable={trelloLu} />
    </div>
  );
}
