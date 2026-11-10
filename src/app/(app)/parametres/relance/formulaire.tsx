"use client";

import { useActionState, useEffect, useState } from "react";
import { compterDestinataires, creerCampagne, type EtatRelance } from "@/lib/relance/actions";

const STATUTS = [["candidat", "Candidats"], ["consultant", "Consultants"], ["en_mission", "En mission"]] as const;

export default function FormulaireCampagne({ objet, corps, apercu }: { objet: string; corps: string; apercu: string }) {
  const [etat, action, enCours] = useActionState<EtatRelance, FormData>(creerCampagne, {});
  const [statuts, setStatuts] = useState<string[]>([]);
  const [jours, setJours] = useState(90);
  const [nombre, setNombre] = useState<number | null>(null);
  useEffect(() => {
    let actif = true;
    compterDestinataires({ statuts, dispoPlusVieilleQueJours: jours || undefined }).then((n) => { if (actif) setNombre(n); });
    return () => { actif = false; };
  }, [statuts, jours]);

  return (
    <form action={action} className="mt-5 grid gap-5 lg:grid-cols-2">
      <div className="space-y-4 text-sm">
        <fieldset>
          <legend className="font-medium text-nuit">Qui relancer ?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {STATUTS.map(([v, l]) => (
              <label key={v} className={`cursor-pointer rounded-full px-3.5 py-1.5 font-medium ring-1 transition ${statuts.includes(v) ? "bg-nuit text-white ring-nuit" : "bg-white/70 text-slate-600 ring-white/80"}`}>
                <input type="checkbox" name="statuts" value={v} className="sr-only" checked={statuts.includes(v)}
                  onChange={() => setStatuts((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]))} />{l}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">Aucun choix = tout le monde (sauf inactifs et désinscrits).</p>
        </fieldset>
        <label className="block font-medium text-nuit">Disponibilité non mise à jour depuis
          <select name="dispo_jours" value={jours} onChange={(e) => setJours(Number(e.target.value))} className="champ mt-1 w-full">
            <option value={0}>peu importe</option><option value={30}>plus d&apos;1 mois</option><option value={90}>plus de 3 mois</option><option value={180}>plus de 6 mois</option>
          </select>
        </label>
        <label className="block font-medium text-nuit">Objet<input name="objet" defaultValue={objet} className="champ mt-1 w-full" /></label>
        <label className="block font-medium text-nuit">Message <span className="font-normal text-slate-500">({"{prenom}"} est remplacé par le prénom)</span>
          <textarea name="corps" defaultValue={corps} rows={10} className="champ mt-1 w-full font-sans" />
        </label>
        <div className="flex items-center gap-3">
          <button disabled={enCours || !nombre} className="bouton-primaire">{enCours ? "Préparation…" : `Préparer pour ${nombre ?? "…"} consultant(s)`}</button>
          <span className="text-xs text-slate-500">Rien n&apos;est envoyé avant « Lancer l&apos;envoi ».</span>
        </div>
        {etat.erreur && <p className="text-red-700">{etat.erreur}</p>}
        {etat.message && <p className="text-emerald-700">{etat.message}</p>}
      </div>
      <div className="rounded-2xl bg-white/70 p-5 text-sm ring-1 ring-white/80">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Aperçu (exemple)</div>
        <pre className="mt-2 whitespace-pre-wrap font-sans text-slate-700">{apercu}</pre>
      </div>
    </form>
  );
}
