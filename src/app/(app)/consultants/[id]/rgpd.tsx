"use client";

import { useActionState } from "react";
import { effacerConsultant, type EtatEffacement } from "@/lib/rgpd/actions";
import ListeFichiers from "@/app/(app)/parametres/rgpd/liste-fichiers";

/** Droits RGPD d'une personne : export (droit d'accès) et effacement. Réservé aux administrateurs. */
export default function BlocRGPD({ id, trigramme }: { id: string; trigramme: string }) {
  const [etat, action, enCours] = useActionState<EtatEffacement, FormData>(effacerConsultant, {});
  if (etat.supprimes) return <div className="carte space-y-2 p-5 text-sm"><p className="font-semibold">Fiche effacée.</p><ListeFichiers fichiers={etat.fichiers ?? []} /></div>;
  return (
    <div className="carte space-y-3 p-5 text-sm">
      <h2 className="font-semibold">Données personnelles (RGPD)</h2>
      <a href={`/consultants/${id}/export`} className="bouton-secondaire">Exporter toutes ses données</a>
      <form action={action} className="space-y-2">
        <input type="hidden" name="id" value={id} />
        <p className="text-zinc-600">Effacer définitivement cette personne de l&apos;outil. Saisissez son trigramme <b>{trigramme}</b> pour confirmer.</p>
        <input name="confirmation" className="champ w-32" />
        <button disabled={enCours} className="bouton-secondaire text-red-700">{enCours ? "Effacement…" : "Effacer définitivement"}</button>
        {etat.erreur && <p className="text-red-700">{etat.erreur}</p>}
      </form>
    </div>
  );
}
