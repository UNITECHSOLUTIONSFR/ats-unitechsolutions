"use client";

import { useActionState } from "react";
import { modifierMission, supprimerMission, type EtatGestionMission } from "@/lib/missions/actions";

/** Modifier (missions créées dans l'outil) et supprimer (administrateurs) une mission. */
export default function GestionMission({ mission, estAdmin }: {
  mission: { id: string; intitule: string; client: string | null; localisation: string | null; texte_besoin: string; trello: boolean };
  estAdmin: boolean;
}) {
  const [modif, modifier, enModif] = useActionState<EtatGestionMission, FormData>(modifierMission, {});
  const [suppr, supprimer, enSuppr] = useActionState<EtatGestionMission, FormData>(supprimerMission, {});
  if (mission.trello && !estAdmin) return null;
  return (
    <details className="carte p-5 text-sm">
      <summary className="cursor-pointer font-semibold text-nuit">{mission.trello ? "Supprimer la mission" : "Modifier ou supprimer la mission"}</summary>
      <div className="mt-4 space-y-5">
        {mission.trello ? (
          <p className="text-slate-600">Mission lue depuis Trello : modifiez-la dans Trello, l&apos;outil suit dans l&apos;heure (ou « Actualiser depuis Trello » sur l&apos;écran Missions).</p>
        ) : (
          <form action={modifier} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="mission_id" value={mission.id} />
            <label className="space-y-1"><span className="text-slate-500">Intitulé</span><input name="intitule" required defaultValue={mission.intitule} className="champ w-full" /></label>
            <label className="space-y-1"><span className="text-slate-500">Client</span><input name="client" defaultValue={mission.client ?? ""} className="champ w-full" /></label>
            <label className="space-y-1 sm:col-span-2"><span className="text-slate-500">Lieu</span><input name="localisation" defaultValue={mission.localisation ?? ""} className="champ w-full" /></label>
            <label className="space-y-1 sm:col-span-2"><span className="text-slate-500">Description du besoin</span><textarea name="texte_besoin" rows={5} defaultValue={mission.texte_besoin} className="champ w-full" /></label>
            <div className="flex items-center gap-3 sm:col-span-2">
              <button disabled={enModif} className="bouton-primaire">{enModif ? "Enregistrement…" : "Enregistrer"}</button>
              {modif.message && <span className="text-emerald-700">{modif.message}</span>}
              {modif.erreur && <span className="text-red-700">{modif.erreur}</span>}
            </div>
          </form>
        )}
        {estAdmin && (
          <form action={supprimer} className="space-y-2 border-t border-slate-100 pt-4">
            <input type="hidden" name="mission_id" value={mission.id} />
            <p className="text-slate-600">
              Supprimer définitivement cette mission et son suivi des candidats. Saisissez <b>SUPPRIMER</b> pour confirmer.
              {mission.trello && " La carte Trello ne sera plus réimportée : pensez à l'archiver dans Trello."}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <input name="confirmation" className="champ w-40" autoComplete="off" />
              <button disabled={enSuppr} className="bouton-secondaire text-red-700">{enSuppr ? "Suppression…" : "Supprimer la mission"}</button>
              {suppr.erreur && <span className="text-red-700">{suppr.erreur}</span>}
            </div>
          </form>
        )}
      </div>
    </details>
  );
}
