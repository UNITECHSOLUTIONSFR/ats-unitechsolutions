"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ajouterExigence, modifierExigenceDirect } from "@/lib/missions/actions";
import CarteExigences from "../carte-exigences";

export interface Exigence { competence_id: string; nom: string; obligatoire: boolean; importance: number; profils: number }

/** Exigences d'une mission existante : chaque changement est enregistré et le classement recalculé. */
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

  return (
    <section className="carte p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold tracking-tight text-nuit">Le besoin en bref</h2>
        <p className="text-sm text-slate-500">{enCours ? "Recalcul du classement…" : "Chaque changement recalcule le classement."}</p>
      </div>
      <CarteExigences
        items={liste.map((e) => ({
          cle: e.competence_id, nom: e.nom, obligatoire: e.obligatoire, importance: e.importance, alerte: e.profils === 0,
          detail: e.profils === 0 ? "Aucun profil sous ce nom (cherché aussi dans les CV)" : `${e.profils.toLocaleString("fr-FR")} profil${e.profils > 1 ? "s" : ""} l'ont`,
        }))}
        onBasculer={(id, o) => modifier(id, "obligatoire", String(o))}
        onRetirer={(id) => modifier(id, "retirer")}
        onImportance={(id, n) => modifier(id, "importance", String(n))} />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <form onSubmit={(e) => { e.preventDefault(); ajouter(); }} className="flex w-full gap-2 sm:w-auto">
          <input value={ajout} onChange={(e) => setAjout(e.target.value)} placeholder="+ Ajouter une compétence" className="champ min-w-0 flex-1 sm:w-56" />
          <button disabled={!ajout.trim() || enCours} className="bouton-secondaire">Ajouter</button>
        </form>
        {texteBesoin && (
          <details className="text-sm sm:ml-auto">
            <summary className="cursor-pointer font-medium text-marque-600">Voir le texte du besoin</summary>
            <pre className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 font-sans text-slate-700 ring-1 ring-slate-100">{texteBesoin}</pre>
          </details>
        )}
      </div>
    </section>
  );
}
