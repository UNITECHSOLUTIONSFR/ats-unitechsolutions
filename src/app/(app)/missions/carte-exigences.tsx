"use client";

import { useState } from "react";

/** Une compétence demandée, telle qu'affichée (création de mission ou mission existante). */
export interface ItemExigence { cle: string; nom: string; obligatoire: boolean; importance: number; detail?: string; alerte?: boolean }

const VISIBLES = 8;

/**
 * Le besoin en bref : les compétences indispensables (peu nombreuses), puis l'environnement technique.
 * Toucher une compétence de l'environnement la rend indispensable ; toucher une indispensable la remet dans l'environnement ; ✕ la retire.
 * Le reste (importance, synonymes, compétences trouvées dans les CV) est géré par l'outil.
 */
export default function CarteExigences({ items, onBasculer, onRetirer }: {
  items: ItemExigence[];
  onBasculer: (cle: string, obligatoire: boolean) => void;
  onRetirer: (cle: string) => void;
  onImportance?: (cle: string, importance: number) => void;
}) {
  const [tout, setTout] = useState(false);
  const indispensables = items.filter((e) => e.obligatoire);
  const environnement = items.filter((e) => !e.obligatoire).sort((a, b) => b.importance - a.importance);
  const montres = tout ? environnement : environnement.slice(0, VISIBLES);

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-baseline gap-2">
          <h3 className="text-sm font-bold text-nuit">Indispensables</h3>
          <span className="text-xs text-slate-500">sans elles, le profil est écarté</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {indispensables.map((e) => (
            <Puce key={e.cle} e={e} principale onClick={() => onBasculer(e.cle, false)} onRetirer={() => onRetirer(e.cle)}
              titre="Indispensable : toucher pour la remettre dans l'environnement" />
          ))}
          {!indispensables.length && <span className="text-sm text-slate-500">Aucune : tous les profils sont classés au score.</span>}
        </div>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
          <h3 className="text-sm font-bold text-nuit">Environnement technique</h3>
          <span className="text-xs text-slate-500">un plus pour le score · toucher pour rendre indispensable</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {montres.map((e) => (
            <Puce key={e.cle} e={e} onClick={() => onBasculer(e.cle, true)} onRetirer={() => onRetirer(e.cle)}
              titre="Toucher pour la rendre indispensable" />
          ))}
          {environnement.length > VISIBLES && (
            <button type="button" onClick={() => setTout(!tout)} className="rounded-full px-3 py-1.5 text-sm font-semibold text-marque-600 hover:bg-marque-50">
              {tout ? "Réduire" : `+ ${environnement.length - VISIBLES} autres`}
            </button>
          )}
          {!environnement.length && <span className="text-sm text-slate-500">Aucune.</span>}
        </div>
      </div>
    </div>
  );
}

function Puce({ e, principale, onClick, onRetirer, titre }: { e: ItemExigence; principale?: boolean; onClick: () => void; onRetirer: () => void; titre: string }) {
  return (
    <span className={`group inline-flex max-w-full items-center rounded-full text-sm font-semibold transition ${
      principale ? "bg-nuit text-white shadow-[0_6px_16px_-8px_rgba(11,26,63,0.7)]" : "bg-white text-nuit ring-1 ring-slate-200 hover:ring-marque-300"}`}>
      <button type="button" onClick={onClick} title={e.detail ? `${titre} — ${e.detail}` : titre} className="min-w-0 truncate py-1.5 pl-3.5 pr-1">
        {principale && <span aria-hidden className="mr-1">★</span>}{e.nom}
        {e.alerte && <span className="ml-1 text-amber-500" aria-label="Aucun profil sous ce nom">•</span>}
      </button>
      <button type="button" onClick={onRetirer} aria-label={`Retirer ${e.nom}`}
        className={`mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs transition ${principale ? "text-white/60 hover:bg-white/15 hover:text-white" : "text-slate-300 hover:bg-red-50 hover:text-red-600"}`}>✕</button>
    </span>
  );
}
