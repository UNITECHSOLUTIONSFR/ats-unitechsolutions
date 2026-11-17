"use client";

import { useState } from "react";
import { fusionnerLignes } from "@/lib/tableau/actions";
import { AttenteVoile } from "../../attente";

/** Colonne par colonne : un clic sur une valeur la reprend ; la valeur gardée reste modifiable. */
export default function FormulaireFusionLignes({ gardeId, videeId, positions, colonnes }: {
  gardeId: string; videeId: string; positions: [number, number]; colonnes: { entete: string; garde: string; autre: string }[];
}) {
  const [finales, setFinales] = useState<Record<string, string>>(() => Object.fromEntries(colonnes.map((c) => [c.entete, c.garde || c.autre])));
  const [envoi, setEnvoi] = useState(false);
  const fixer = (k: string, v: string) => setFinales((f) => ({ ...f, [k]: v }));
  const bouton = (c: { entete: string }, v: string) => (
    <button type="button" onClick={() => fixer(c.entete, v)} disabled={!v}
      className={`w-full rounded-lg px-2 py-1.5 text-left transition ${finales[c.entete] === v && v ? "bg-marque-50 ring-1 ring-marque-200" : "hover:bg-slate-50"} disabled:cursor-default`}>
      {v || <em className="text-slate-400">vide</em>}
    </button>
  );
  return (
    <form action={fusionnerLignes} onSubmit={() => setEnvoi(true)} className="space-y-4">
      <AttenteVoile actif={envoi} messages={["Je fusionne les deux lignes…", "Je mets à jour le fichier Excel…"]} />
      <input type="hidden" name="garde" value={gardeId} />
      <input type="hidden" name="videe" value={videeId} />
      <div className="carte overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr><th className="w-44 p-3">Colonne</th><th className="p-3">Ligne {positions[0]} (gardée)</th><th className="p-3">Ligne {positions[1]} (retirée)</th><th className="w-[30%] p-3 text-marque-700">Valeur gardée (modifiable)</th></tr>
          </thead>
          <tbody>
            {colonnes.map((c) => (
              <tr key={c.entete} className="border-t border-slate-100 align-top">
                <td className="p-3 font-medium text-nuit">{c.entete}</td>
                <td className="p-1.5">{bouton(c, c.garde)}</td>
                <td className="p-1.5">{bouton(c, c.autre)}</td>
                <td className="p-1.5"><input name={`final:${c.entete}`} value={finales[c.entete]} onChange={(e) => fixer(c.entete, e.target.value)} className="champ w-full" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end"><button disabled={envoi} className="bouton-primaire">Fusionner les deux lignes</button></div>
    </form>
  );
}
