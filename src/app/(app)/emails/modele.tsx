"use client";

import Link from "next/link";
import { useActionState, useMemo, useRef, useState } from "react";
import { sauverModele, type EtatModele } from "@/lib/relance/actions";
import { rendreMessage } from "@/lib/relance/modele";

export interface Modele { id: string; nom: string; objet: string; corps: string; type: string }

const VARIABLES = [["{prenom}", "Prénom"], ["{nom}", "Nom"]] as const;

/** Création ou modification d'un modèle : nom, type, objet, message (avec variables), aperçu en direct. */
export default function FormulaireModele({ modele }: { modele?: Modele }) {
  const [etat, action, enCours] = useActionState<EtatModele, FormData>(sauverModele, {});
  const [type, setType] = useState(modele?.type ?? "disponibilite");
  const [objet, setObjet] = useState(modele?.objet ?? "");
  const [corps, setCorps] = useState(modele?.corps ?? "Bonjour {prenom},\n\n");
  const zone = useRef<HTMLTextAreaElement>(null);
  const rendu = useMemo(() => rendreMessage(corps, { prenom: "Marie", nom: "Durand" }, "https://…/desinscription"), [corps]);
  const inserer = (v: string) => {
    const t = zone.current;
    if (!t) return setCorps((c) => c + v);
    const debut = t.selectionStart, fin = t.selectionEnd;
    setCorps(corps.slice(0, debut) + v + corps.slice(fin));
    requestAnimationFrame(() => { t.focus(); t.setSelectionRange(debut + v.length, debut + v.length); });
  };

  return (
    <form action={action} className="grid gap-5 lg:grid-cols-2">
      <input type="hidden" name="id" value={modele?.id ?? ""} />
      <input type="hidden" name="type" value={type} />
      <div className="carte space-y-4 p-6 text-sm">
        <label className="block font-medium text-nuit">Nom du modèle
          <input name="nom" defaultValue={modele?.nom} required placeholder="Ex. Mise à jour des disponibilités" className="champ mt-1 w-full" />
        </label>
        <div>
          <span className="font-medium text-nuit">Type</span>
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            {([["disponibilite", "Demande de disponibilité", "Chaque réponse met à jour la fiche automatiquement."], ["libre", "Email libre", "Les réponses sont rattachées à la fiche."]] as const).map(([v, l, d]) => (
              <button key={v} type="button" onClick={() => setType(v)}
                className={`rounded-2xl p-3 text-left ring-1 transition ${type === v ? "bg-marque-50 ring-marque-300" : "bg-white/70 ring-slate-200 hover:ring-marque-200"}`}>
                <div className="font-semibold text-nuit">{l}</div><div className="text-xs text-slate-500">{d}</div>
              </button>
            ))}
          </div>
        </div>
        <label className="block font-medium text-nuit">Objet
          <input name="objet" value={objet} onChange={(e) => setObjet(e.target.value)} required className="champ mt-1 w-full" />
        </label>
        <div>
          <div className="flex items-center justify-between">
            <span className="font-medium text-nuit">Message</span>
            <span className="flex gap-1.5 text-xs">Insérer :
              {VARIABLES.map(([v, l]) => <button key={v} type="button" onClick={() => inserer(v)} className="rounded-full bg-marque-50 px-2 py-0.5 font-semibold text-marque-700 hover:bg-marque-100">{l}</button>)}
            </span>
          </div>
          <textarea ref={zone} name="corps" value={corps} onChange={(e) => setCorps(e.target.value)} rows={12} required className="champ mt-1 w-full" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button disabled={enCours} className="bouton-primaire px-6 py-2.5">{enCours ? "Enregistrement…" : modele ? "Mettre à jour le modèle" : "Enregistrer le modèle"}</button>
          <Link href="/emails?onglet=modeles" className="bouton-secondaire">Bibliothèque</Link>
          {etat.message && <span className="text-emerald-700">{etat.message}</span>}
          {etat.erreur && <span className="text-red-700">{etat.erreur}</span>}
        </div>
      </div>
      <div className="carte p-6 text-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Aperçu (pour Marie Durand)</div>
        <div className="mt-3 rounded-2xl bg-white p-5 ring-1 ring-slate-100">
          <div className="border-b border-slate-100 pb-3 font-semibold text-nuit">{objet || "Objet de l'email"}</div>
          <pre className="mt-3 whitespace-pre-wrap font-sans leading-relaxed text-slate-700 [overflow-wrap:anywhere]">{rendu}</pre>
        </div>
      </div>
    </form>
  );
}
