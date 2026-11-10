"use client";

import { useActionState } from "react";
import { lancerTache, type EtatTache } from "@/lib/sync/actions";

export default function BoutonTache({ tache }: { tache: string }) {
  const [etat, action, enCours] = useActionState<EtatTache, FormData>(lancerTache, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="tache" value={tache} />
      <button disabled={enCours} className="bouton-secondaire">{enCours ? "En cours… (jusqu'à 5 min)" : "Lancer maintenant"}</button>
      {etat.message && <p className="text-sm text-green-700">{etat.message}</p>}
      {etat.erreur && <p className="text-sm text-red-700">{etat.erreur}</p>}
    </form>
  );
}
