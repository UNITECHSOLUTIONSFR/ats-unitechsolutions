"use client";

import { useState, useTransition } from "react";

export interface Exigence { competence_id: string; nom: string; obligatoire: boolean; importance: number; profils: number }

/**
 * Exigences d'une mission, en deux colonnes (obligatoires / souhaitées).
 * Chaque compétence : interrupteur Obligatoire | Souhaitée, importance (1 à 3), nombre de profils qui l'ont, retrait.
 */
export default function Exigences({ exigences, onModifier }: {
  exigences: Exigence[];
  onModifier?: (competenceId: string, action: "obligatoire" | "importance" | "retirer", valeur?: string) => Promise<void>;
}) {
  const [liste, setListe] = useState(exigences);
  const [, demarrer] = useTransition();
  const modifier = (id: string, action: "obligatoire" | "importance" | "retirer", valeur?: string) => {
    setListe((l) => action === "retirer" ? l.filter((e) => e.competence_id !== id)
      : l.map((e) => e.competence_id !== id ? e : action === "obligatoire" ? { ...e, obligatoire: valeur === "true" } : { ...e, importance: Number(valeur) }));
    if (onModifier) demarrer(() => onModifier(id, action, valeur));
  };
  const obligatoires = liste.filter((e) => e.obligatoire);
  const souhaitees = liste.filter((e) => !e.obligatoire).sort((a, b) => b.importance - a.importance);

  return (
    <section className="carte p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold tracking-tight text-nuit">Exigences de la mission</h2>
        <p className="text-sm text-slate-500">Le classement se recalcule à chaque changement.</p>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Colonne titre="Obligatoires" sousTitre="Un profil qui n'en a pas une est écarté" teinte="obligatoire" liste={obligatoires} modifier={modifier} />
        <Colonne titre="Souhaitées" sousTitre="Elles font monter le score" teinte="souhaitee" liste={souhaitees} modifier={modifier} />
      </div>
    </section>
  );
}

function Colonne({ titre, sousTitre, teinte, liste, modifier }: {
  titre: string; sousTitre: string; teinte: "obligatoire" | "souhaitee"; liste: Exigence[];
  modifier: (id: string, action: "obligatoire" | "importance" | "retirer", valeur?: string) => void;
}) {
  const fond = teinte === "obligatoire" ? "bg-gradient-to-br from-marque-50 to-white ring-marque-100" : "bg-white/60 ring-white/80";
  return (
    <div className={`rounded-2xl p-4 ring-1 ${fond}`}>
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="font-semibold text-nuit">{titre} <span className="ml-1 rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-500 ring-1 ring-slate-200">{liste.length}</span></h3>
        <span className="text-xs text-slate-400">{sousTitre}</span>
      </div>
      <ul className="space-y-2">
        {liste.map((e) => (
          <li key={e.competence_id} className="group flex items-center gap-3 rounded-xl bg-white/90 px-3 py-2.5 shadow-[0_1px_2px_rgba(11,26,63,0.05)] ring-1 ring-slate-100">
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-nuit">{e.nom}</div>
              <div className={`text-xs ${e.profils === 0 ? "text-amber-600" : "text-slate-400"}`}>
                {e.profils === 0 ? "Aucun profil ne l'a sous ce nom" : `${e.profils.toLocaleString("fr-FR")} profil${e.profils > 1 ? "s" : ""} dans la base`}
              </div>
            </div>
            <Importance valeur={e.importance} onChange={(v) => modifier(e.competence_id, "importance", String(v))} />
            <div className="flex rounded-full bg-slate-100 p-0.5 text-xs font-semibold">
              <button onClick={() => modifier(e.competence_id, "obligatoire", "true")}
                className={`rounded-full px-2.5 py-1 transition ${e.obligatoire ? "bg-nuit text-white shadow" : "text-slate-500 hover:text-nuit"}`}>Obligatoire</button>
              <button onClick={() => modifier(e.competence_id, "obligatoire", "false")}
                className={`rounded-full px-2.5 py-1 transition ${!e.obligatoire ? "bg-white text-nuit shadow" : "text-slate-500 hover:text-nuit"}`}>Souhaitée</button>
            </div>
            <button onClick={() => modifier(e.competence_id, "retirer")} aria-label={`Retirer ${e.nom}`}
              className="flex h-7 w-7 items-center justify-center rounded-full text-slate-300 transition hover:bg-red-50 hover:text-red-600">✕</button>
          </li>
        ))}
        {!liste.length && <li className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-400">Aucune</li>}
      </ul>
    </div>
  );
}

/** Importance en 3 crans (secondaire, importante, essentielle). */
function Importance({ valeur, onChange }: { valeur: number; onChange: (v: number) => void }) {
  const libelles = ["", "Secondaire", "Importante", "Essentielle"];
  return (
    <div className="hidden items-center gap-1 sm:flex" title={libelles[valeur]}>
      {[1, 2, 3].map((n) => (
        <button key={n} onClick={() => onChange(n)} aria-label={libelles[n]}
          className={`h-2 w-5 rounded-full transition ${n <= valeur ? "bg-marque-500" : "bg-slate-200 hover:bg-marque-200"}`} />
      ))}
    </div>
  );
}
