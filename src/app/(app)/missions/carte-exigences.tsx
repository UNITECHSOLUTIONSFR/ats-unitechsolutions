"use client";

/** Une compétence demandée, telle qu'affichée (création de mission ou mission existante). */
export interface ItemExigence { cle: string; nom: string; obligatoire: boolean; importance: number; detail?: string; alerte?: boolean }

/**
 * Compétences demandées, en deux colonnes clairement expliquées :
 * « Obligatoires » (sans elle, le consultant est écarté) et « Souhaitées » (elle ajoute des points).
 * Chaque compétence : un interrupteur Obligatoire | Souhaitée, son importance, ✕ pour la retirer.
 */
export default function CarteExigences({ items, onBasculer, onRetirer, onImportance }: {
  items: ItemExigence[];
  onBasculer: (cle: string, obligatoire: boolean) => void;
  onRetirer: (cle: string) => void;
  onImportance?: (cle: string, importance: number) => void;
}) {
  const obligatoires = items.filter((e) => e.obligatoire);
  const souhaitees = items.filter((e) => !e.obligatoire).sort((a, b) => b.importance - a.importance);
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <Colonne titre="Obligatoires" icone="🔒" texte="Le consultant doit l'avoir : sinon il est écarté du classement." teinte="rouge"
        liste={obligatoires} vide="Aucune : personne n'est écarté, tout se joue au score." onBasculer={onBasculer} onRetirer={onRetirer} onImportance={onImportance} />
      <Colonne titre="Souhaitées" icone="➕" texte="Un plus : chacune ajoute des points au score, sans écarter personne." teinte="bleu"
        liste={souhaitees} vide="Aucune." onBasculer={onBasculer} onRetirer={onRetirer} onImportance={onImportance} large />
    </div>
  );
}

function Colonne({ titre, icone, texte, teinte, liste, vide, large, onBasculer, onRetirer, onImportance }: {
  titre: string; icone: string; texte: string; teinte: "rouge" | "bleu"; liste: ItemExigence[]; vide: string; large?: boolean;
  onBasculer: (cle: string, obligatoire: boolean) => void; onRetirer: (cle: string) => void; onImportance?: (cle: string, importance: number) => void;
}) {
  const fond = teinte === "rouge" ? "bg-rose-50/70 ring-rose-200" : "bg-marque-50/50 ring-marque-100";
  const barre = teinte === "rouge" ? "border-l-rose-500" : "border-l-marque-400";
  return (
    <section className={`rounded-2xl p-4 ring-1 ${fond}`}>
      <header className="mb-3">
        <h3 className="flex items-center gap-2 font-bold text-nuit">
          <span aria-hidden>{icone}</span>{titre}
          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-500 ring-1 ring-slate-200">{liste.length}</span>
        </h3>
        <p className="mt-0.5 text-xs text-slate-600">{texte}</p>
      </header>
      <ul className={`grid gap-2 ${large ? "xl:grid-cols-2" : ""}`}>
        {liste.map((e) => (
          <li key={e.cle} className={`rounded-xl border-l-4 bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(11,26,63,0.06)] ${barre}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 break-words font-semibold text-nuit">{e.nom}</div>
              <button type="button" onClick={() => onRetirer(e.cle)} aria-label={`Retirer ${e.nom}`}
                className="-mr-1 -mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600">✕</button>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
              {e.detail ? <span className={`text-xs ${e.alerte ? "text-amber-700" : "text-slate-500"}`}>{e.detail}</span> : <span />}
              <div className="flex items-center gap-2.5">
                {onImportance && <Importance valeur={e.importance} onChange={(v) => onImportance(e.cle, v)} />}
                <div className="flex rounded-full bg-slate-100 p-0.5 text-xs font-semibold" role="group" aria-label="Type d'exigence">
                  <button type="button" onClick={() => onBasculer(e.cle, true)} aria-pressed={e.obligatoire}
                    className={`rounded-full px-2.5 py-1 transition ${e.obligatoire ? "bg-rose-600 text-white shadow" : "text-slate-500 hover:text-nuit"}`}>Obligatoire</button>
                  <button type="button" onClick={() => onBasculer(e.cle, false)} aria-pressed={!e.obligatoire}
                    className={`rounded-full px-2.5 py-1 transition ${!e.obligatoire ? "bg-marque-600 text-white shadow" : "text-slate-500 hover:text-nuit"}`}>Souhaitée</button>
                </div>
              </div>
            </div>
          </li>
        ))}
        {!liste.length && <li className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-3 py-4 text-center text-sm text-slate-500">{vide}</li>}
      </ul>
    </section>
  );
}

/** Importance en 3 crans (secondaire, importante, essentielle). */
function Importance({ valeur, onChange }: { valeur: number; onChange: (v: number) => void }) {
  const libelles = ["", "Secondaire", "Importante", "Essentielle"];
  return (
    <div className="flex items-center gap-1" title={`Importance : ${libelles[valeur]}`}>
      {[1, 2, 3].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} aria-label={libelles[n]}
          className={`h-2 w-4 rounded-full transition ${n <= valeur ? "bg-marque-500" : "bg-slate-200 hover:bg-marque-200"}`} />
      ))}
    </div>
  );
}
