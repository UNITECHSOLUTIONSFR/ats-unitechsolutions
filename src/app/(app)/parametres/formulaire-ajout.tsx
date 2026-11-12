"use client";

import { useActionState } from "react";
import { ajouterUtilisateur, type EtatUtilisateur } from "@/lib/utilisateurs/actions";

export default function FormulaireAjout() {
  const [etat, action, enCours] = useActionState<EtatUtilisateur, FormData>(ajouterUtilisateur, {});
  return (
    <form action={action} className="mt-3 flex flex-wrap items-end gap-3 text-sm">
      <label className="flex flex-col">
        <span className="text-zinc-600">Email professionnel</span>
        <input name="email" type="email" required className="mt-1 w-full max-w-72 champ" />
      </label>
      <label className="flex flex-col">
        <span className="text-zinc-600">Nom affiché</span>
        <input name="nom_affiche" className="mt-1 w-48 champ" />
      </label>
      <label className="flex flex-col">
        <span className="text-zinc-600">Rôle</span>
        <select name="role" defaultValue="recruteur" className="champ mt-1">
          <option value="recruteur">Recruteur</option>
          <option value="admin">Administrateur</option>
        </select>
      </label>
      <button disabled={enCours} className="bouton-primaire">
        {enCours ? "Ajout…" : "Donner l'accès"}
      </button>
      {etat.message && <p className="w-full text-green-700">{etat.message}</p>}
      {etat.erreur && <p className="w-full text-red-700">{etat.erreur}</p>}
    </form>
  );
}
