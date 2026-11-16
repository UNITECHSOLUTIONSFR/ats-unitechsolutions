"use client";

import Link from "next/link";
import { useState } from "react";
import { fusionnerFiches } from "@/lib/consultants/actions";
import { AttenteVoile } from "../../attente";

export interface ChampFusion { cle: string; libelle: string; garde: string; autre: string; type?: "texte" | "long" | "date" | "statut" }

const STATUTS: [string, string][] = [["candidat", "Candidat"], ["consultant", "Consultant"], ["inactif", "Inactif"]];

/**
 * Fusion de deux fiches : pour chaque champ, la valeur finale est modifiable librement (corriger, compléter, ajouter) ;
 * un clic sur la valeur d'une des deux fiches la recopie dans la valeur finale.
 */
export default function FormulaireFusion({ gardeId, autreId, champs, entetes }: {
  gardeId: string; autreId: string; champs: ChampFusion[]; entetes: { garde: React.ReactNode; autre: React.ReactNode };
}) {
  // Valeur finale par défaut : celle de la fiche gardée, sinon celle de l'autre fiche.
  const [finales, setFinales] = useState<Record<string, string>>(() => Object.fromEntries(champs.map((c) => [c.cle, c.garde || c.autre])));
  const [envoi, setEnvoi] = useState(false);
  const fixer = (k: string, v: string) => setFinales((f) => ({ ...f, [k]: v }));
  const valeur = (v: string) => (v ? v : <em className="text-slate-400">vide</em>);
  const bouton = (c: ChampFusion, v: string) => (
    <button type="button" onClick={() => fixer(c.cle, v)} disabled={!v}
      className={`w-full rounded-lg px-2 py-1.5 text-left transition ${finales[c.cle] === v && v ? "bg-marque-50 ring-1 ring-marque-200" : "hover:bg-slate-50"} disabled:cursor-default`}
      title={v ? "Utiliser cette valeur" : undefined}>
      {valeur(v)}
    </button>
  );
  return (
    <form action={fusionnerFiches} onSubmit={() => setEnvoi(true)} className="space-y-4">
      <AttenteVoile actif={envoi} messages={["Je réunis les deux fiches…", "Je déplace les CV, les missions et l'historique…"]} />
      <input type="hidden" name="garde" value={gardeId} />
      <input type="hidden" name="supprime" value={autreId} />
      <div className="carte overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              <th className="w-36 p-3">Champ</th>
              <th className="p-3">{entetes.garde}</th>
              <th className="p-3">{entetes.autre}</th>
              <th className="w-[30%] p-3 text-marque-700">Valeur gardée (modifiable)</th>
            </tr>
          </thead>
          <tbody>
            {champs.map((c) => (
              <tr key={c.cle} className="border-t border-slate-100 align-top">
                <td className="p-3 font-medium text-nuit">{c.libelle}</td>
                <td className="p-1.5">{bouton(c, c.garde)}</td>
                <td className="p-1.5">{bouton(c, c.autre)}</td>
                <td className="p-1.5">
                  {c.type === "long" ? (
                    <textarea name={`final:${c.cle}`} value={finales[c.cle]} onChange={(e) => fixer(c.cle, e.target.value)} rows={3} className="champ w-full" />
                  ) : c.type === "statut" ? (
                    <select name={`final:${c.cle}`} value={finales[c.cle]} onChange={(e) => fixer(c.cle, e.target.value)} className="champ w-full">
                      {STATUTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  ) : (
                    <input name={`final:${c.cle}`} type={c.type === "date" ? "date" : "text"} value={finales[c.cle]} onChange={(e) => fixer(c.cle, e.target.value)} className="champ w-full" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">Cliquez sur une valeur pour la reprendre, ou saisissez directement la valeur à garder. Un champ vidé est effacé.</p>
      <div className="flex items-center justify-between">
        <Link href="/alertes" className="bouton-secondaire">Annuler</Link>
        <button disabled={envoi} className="bouton-primaire px-6 py-2.5">Fusionner les deux fiches</button>
      </div>
    </form>
  );
}
