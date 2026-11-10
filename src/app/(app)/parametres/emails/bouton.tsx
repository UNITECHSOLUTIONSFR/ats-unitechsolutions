"use client";

import { useActionState } from "react";
import { lancerTraitementEmails, type EtatEmails } from "@/lib/emails/actions";

export default function Bouton() {
  const [etat, action, enCours] = useActionState<EtatEmails, FormData>(lancerTraitementEmails, {});
  return (
    <div className="space-y-2">
      <form action={action}>
        <button disabled={enCours} className="bouton-primaire">{enCours ? "Traitement des emails… (jusqu'à 5 minutes)" : "Traiter les nouveaux emails"}</button>
      </form>
      {etat.message && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{etat.message}</p>}
      {etat.erreur && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{etat.erreur}</p>}
    </div>
  );
}
