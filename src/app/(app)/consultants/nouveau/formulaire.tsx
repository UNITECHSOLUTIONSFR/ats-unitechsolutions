"use client";

import { useActionState } from "react";
import { creerConsultant, type EtatCreation } from "@/lib/consultants/actions";

const CHAMPS: [string, string, string?][] = [
  ["prenom", "Prénom"], ["nom", "Nom *"], ["email", "Email", "email"], ["telephone", "Téléphone"],
  ["intitule_poste", "Métier / poste"], ["disponibilite", "Disponibilité"], ["localisation", "Localisation"],
];

export default function Formulaire() {
  const [etat, action, enCours] = useActionState<EtatCreation, FormData>(creerConsultant, {});
  return (
    <form action={action} className="carte grid gap-3 p-5 text-sm sm:grid-cols-2">
      {CHAMPS.map(([nom, libelle, type]) => (
        <label key={nom} className="block">
          <span className="text-zinc-600">{libelle}</span>
          <input name={nom} type={type ?? "text"} required={nom === "nom"} className="champ mt-1 w-full" />
        </label>
      ))}
      <label className="block sm:col-span-2">
        <span className="text-zinc-600">Notes</span>
        <textarea name="notes" rows={3} className="champ mt-1 w-full" />
      </label>
      <div className="sm:col-span-2">
        <button disabled={enCours} className="bouton-primaire">{enCours ? "Création…" : "Créer la fiche"}</button>
        {etat.erreur && <p className="mt-2 text-red-700">{etat.erreur}</p>}
      </div>
    </form>
  );
}
