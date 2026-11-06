"use client";

import { useActionState } from "react";
import { creerMission, type EtatFormulaireMission } from "@/lib/missions/actions";

export default function FormulaireMission() {
  const [etat, action, enCours] = useActionState<EtatFormulaireMission, FormData>(creerMission, {});
  return (
    <form action={action} className="space-y-4 rounded-xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
      <div>
        <label htmlFor="client" className="block text-sm font-medium">Client (facultatif)</label>
        <input id="client" name="client" className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2" />
      </div>
      <div>
        <label htmlFor="texte_besoin" className="block text-sm font-medium">Texte du besoin</label>
        <textarea
          id="texte_besoin"
          name="texte_besoin"
          required
          rows={14}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm"
          placeholder="Collez ici la fiche de poste ou l'email du client…"
        />
      </div>
      {etat.erreur && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{etat.erreur}</p>}
      <button disabled={enCours} className="rounded-lg bg-zinc-900 px-4 py-2 font-medium text-white disabled:opacity-50">
        {enCours ? "Analyse du besoin…" : "Enregistrer et trouver les consultants"}
      </button>
    </form>
  );
}
