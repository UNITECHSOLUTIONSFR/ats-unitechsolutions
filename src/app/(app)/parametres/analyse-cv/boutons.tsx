"use client";

import { useActionState } from "react";
import { lancerAnalyse, recupererResultats, type EtatAnalyse } from "@/lib/analyse-cv/actions";

export default function Boutons({ enCours, aFaire }: { enCours: boolean; aFaire: number }) {
  const [etatLancer, lancer, lancement] = useActionState<EtatAnalyse, FormData>(lancerAnalyse, {});
  const [etatRecup, recuperer, recuperation] = useActionState<EtatAnalyse, FormData>(recupererResultats, {});
  const etat = etatRecup.message || etatRecup.erreur ? etatRecup : etatLancer;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {!enCours && (
          <form action={lancer}>
            <button disabled={lancement || !aFaire} className="bouton-primaire">
              {lancement ? "Lecture des CV dans SharePoint… (quelques minutes)" : `1. Analyser ${aFaire} CV`}
            </button>
          </form>
        )}
        {enCours && (
          <form action={recuperer}>
            <button disabled={recuperation} className="bouton-primaire">
              {recuperation ? "Enregistrement…" : "2. Récupérer les résultats"}
            </button>
          </form>
        )}
      </div>
      {enCours && <p className="text-sm text-zinc-500">Analyse envoyée : elle prend en général quelques minutes. Cliquez ensuite sur « Récupérer les résultats ».</p>}
      {etat.message && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{etat.message}</p>}
      {etat.erreur && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{etat.erreur}</p>}
    </div>
  );
}
