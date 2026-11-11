"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ajouterExigence, modifierExigenceDirect } from "@/lib/missions/actions";

export interface Exigence { competence_id: string; nom: string; obligatoire: boolean; importance: number; profils: number }

/**
 * Exigences d'une mission, en deux colonnes (obligatoires / souhaitées).
 * Chaque compétence : interrupteur Obligatoire | Souhaitée, importance (1 à 3), nombre de profils qui l'ont, retrait.
 */
export default function Exigences({ missionId, exigences, texteBesoin }: { missionId: string; exigences: Exigence[]; texteBesoin: string | null }) {
  const [liste, setListe] = useState(exigences);
  const [ajout, setAjout] = useState("");
  const [enCours, demarrer] = useTransition();
  const routeur = useRouter();
  const modifier = (id: string, action: "obligatoire" | "importance" | "retirer", valeur?: string) => {
    setListe((l) => action === "retirer" ? l.filter((e) => e.competence_id !== id)
      : l.map((e) => e.competence_id !== id ? e : action === "obligatoire" ? { ...e, obligatoire: valeur === "true" } : { ...e, importance: Number(valeur) }));
    demarrer(async () => { await modifierExigenceDirect(missionId, id, action, valeur); routeur.refresh(); });
  };
  const ajouter = () => {
    const n = ajout.trim();
    if (!n) return;
    setAjout("");
    demarrer(async () => { await ajouterExigence(missionId, n); routeur.refresh(); });
  };
  const obligatoires = liste.filter((e) => e.obligatoire);
  const souhaitees = liste.filter((e) => !e.obligatoire).sort((a, b) => b.importance - a.importance);

  return (
    <section className="carte p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold tracking-tight text-nuit">Exigences de la mission</h2>
        <p className="text-sm text-slate-500">{enCours ? "Recalcul du classement…" : "Le classement se recalcule à chaque changement."}</p>
      </div>
      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Colonne titre="Obligatoires" sousTitre="Un profil qui n'en a pas une est écarté" teinte="obligatoire" liste={obligatoires} modifier={modifier} />
        <Colonne titre="Souhaitées" sousTitre="Elles font monter le score" teinte="souhaitee" liste={souhaitees} modifier={modifier} large />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <form onSubmit={(e) => { e.preventDefault(); ajouter(); }} className="flex gap-2">
          <input value={ajout} onChange={(e) => setAjout(e.target.value)} placeholder="Ajouter une compétence" className="champ w-56" />
          <button disabled={!ajout.trim() || enCours} className="bouton-secondaire">Ajouter</button>
        </form>
        {texteBesoin && (
          <details className="ml-auto text-sm">
            <summary className="cursor-pointer font-medium text-marque-600">Voir le texte du besoin</summary>
            <pre className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-xl bg-white/70 p-3 font-sans text-slate-700 ring-1 ring-slate-100">{texteBesoin}</pre>
          </details>
        )}
      </div>
    </section>
  );
}

function Colonne({ titre, sousTitre, teinte, liste, modifier, large }: {
  titre: string; sousTitre: string; teinte: "obligatoire" | "souhaitee"; liste: Exigence[]; large?: boolean;
  modifier: (id: string, action: "obligatoire" | "importance" | "retirer", valeur?: string) => void;
}) {
  const fond = teinte === "obligatoire" ? "bg-gradient-to-br from-marque-50 to-white ring-marque-100" : "bg-white/60 ring-white/80";
  return (
    <div className={`rounded-2xl p-4 ring-1 ${fond}`}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="font-semibold text-nuit">{titre} <span className="ml-1 rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-500 ring-1 ring-slate-200">{liste.length}</span></h3>
        <span className="text-xs text-slate-400">{sousTitre}</span>
      </div>
      <ul className={`grid gap-2 ${large ? "xl:grid-cols-2" : ""}`}>
        {liste.map((e) => (
          <li key={e.competence_id} className="rounded-xl bg-white/90 px-3 py-2.5 shadow-[0_1px_2px_rgba(11,26,63,0.05)] ring-1 ring-slate-100">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 truncate font-semibold text-nuit" title={e.nom}>{e.nom}</div>
              <button onClick={() => modifier(e.competence_id, "retirer")} aria-label={`Retirer ${e.nom}`}
                className="-mr-1 -mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-300 transition hover:bg-red-50 hover:text-red-600">✕</button>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
              <span className={`text-xs ${e.profils === 0 ? "text-amber-600" : "text-slate-400"}`}>
                {e.profils === 0 ? "Aucun profil sous ce nom" : `${e.profils.toLocaleString("fr-FR")} profil${e.profils > 1 ? "s" : ""}`}
              </span>
              <div className="flex items-center gap-2.5">
                <Importance valeur={e.importance} onChange={(v) => modifier(e.competence_id, "importance", String(v))} />
                <div className="flex rounded-full bg-slate-100 p-0.5 text-[11px] font-semibold">
                  <button onClick={() => modifier(e.competence_id, "obligatoire", "true")}
                    className={`rounded-full px-2 py-0.5 transition ${e.obligatoire ? "bg-nuit text-white shadow" : "text-slate-500 hover:text-nuit"}`}>Obligatoire</button>
                  <button onClick={() => modifier(e.competence_id, "obligatoire", "false")}
                    className={`rounded-full px-2 py-0.5 transition ${!e.obligatoire ? "bg-white text-nuit shadow" : "text-slate-500 hover:text-nuit"}`}>Souhaitée</button>
                </div>
              </div>
            </div>
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
          className={`h-1.5 w-4 rounded-full transition ${n <= valeur ? "bg-marque-500" : "bg-slate-200 hover:bg-marque-200"}`} />
      ))}
    </div>
  );
}
