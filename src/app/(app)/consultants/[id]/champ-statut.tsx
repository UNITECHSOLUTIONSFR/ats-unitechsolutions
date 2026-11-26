"use client";

import { useState } from "react";
import { LIBELLES_STATUT, STATUTS_FICHE } from "@/lib/consultants/statuts";

/** Statut de la fiche, avec le client et la date de fin (en mission) ou le motif (ne pas contacter). */
export default function ChampStatut({ statut, client, fin, motif }: { statut: string; client: string | null; fin: string | null; motif: string | null }) {
  const [valeur, setValeur] = useState(statut);
  const enMission = valeur === "en_mission_unitech" || valeur === "en_mission_ailleurs";
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-slate-600">Statut</span>
        <select name="statut" value={valeur} onChange={(e) => setValeur(e.target.value)} className="champ mt-1 w-full">
          {STATUTS_FICHE.map((s) => <option key={s} value={s}>{LIBELLES_STATUT[s]}</option>)}
        </select>
      </label>
      {enMission && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="text-slate-600">Client de la mission (facultatif)</span>
            <input name="mission_client" defaultValue={client ?? ""} className="champ mt-1 w-full" /></label>
          <label className="block"><span className="text-slate-600">Fin de mission prévue (facultatif)</span>
            <input name="mission_fin" type="date" defaultValue={fin ?? ""} className="champ mt-1 w-full" /></label>
        </div>
      )}
      {valeur === "ne_pas_contacter" && (
        <label className="block"><span className="text-slate-600">Motif (facultatif)</span>
          <input name="statut_motif" defaultValue={motif ?? ""} placeholder="Ex. : décidé par Anaëlle le 26/11" className="champ mt-1 w-full" /></label>
      )}
    </div>
  );
}
