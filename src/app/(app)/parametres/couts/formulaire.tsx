"use client";

import { useActionState } from "react";
import { enregistrerReglages, type EtatReglages } from "@/lib/reglages/actions";
import type { Ponderations } from "@/lib/matching/score";

const LIBELLES: Record<keyof Ponderations, string> = {
  competences: "Compétences communes", annees: "Années d'expérience", seniorite: "Séniorité",
  disponibilite: "Disponibilité", semantique: "Proximité du profil",
};

export default function FormulaireReglages({ plafond, ponderations, seuil }: { plafond: number; ponderations: Ponderations; seuil: number }) {
  const [etat, action, enCours] = useActionState<EtatReglages, FormData>(enregistrerReglages, {});
  return (
    <form action={action} className="carte space-y-4 p-5 text-sm">
      <h2 className="font-semibold">Réglages</h2>
      <label className="block">Plafond IA mensuel ($)
        <input name="plafond" type="number" step="1" min="0" defaultValue={plafond} className="champ mt-1 block w-32" />
      </label>
      <fieldset className="space-y-2">
        <legend className="font-medium">Poids de chaque critère dans le score</legend>
        {(Object.keys(LIBELLES) as (keyof Ponderations)[]).map((k) => (
          <label key={k} className="flex items-center gap-3">
            <span className="w-48">{LIBELLES[k]}</span>
            <input name={k} type="number" min="0" max="100" defaultValue={ponderations[k]} className="champ w-24" />
          </label>
        ))}
        <p className="text-xs text-zinc-500">Le score est toujours ramené sur 100 : seuls les rapports entre poids comptent.</p>
      </fieldset>
      <label className="block">Seuil de signalement d&apos;un nouveau profil sur une mission ouverte (sur 100)
        <input name="seuil" type="number" min="0" max="100" defaultValue={seuil} className="champ mt-1 block w-24" />
      </label>
      <button disabled={enCours} className="bouton-primaire">{enCours ? "Enregistrement…" : "Enregistrer"}</button>
      {etat.message && <p className="text-green-700">{etat.message}</p>}
      {etat.erreur && <p className="text-red-700">{etat.erreur}</p>}
    </form>
  );
}
