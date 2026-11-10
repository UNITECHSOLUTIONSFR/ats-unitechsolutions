"use client";

import { useActionState } from "react";
import { purgerSelection, type EtatEffacement } from "@/lib/rgpd/actions";
import ListeFichiers from "./liste-fichiers";

export default function FormulairePurge({ fiches }: { fiches: { id: string; libelle: string; dernier: string }[] }) {
  const [etat, action, enCours] = useActionState<EtatEffacement, FormData>(purgerSelection, {});
  if (etat.supprimes) return <div className="carte space-y-2 p-5 text-sm"><p className="font-semibold">{etat.supprimes} fiche(s) effacée(s).</p><ListeFichiers fichiers={etat.fichiers ?? []} /></div>;
  if (!fiches.length) return <p className="carte p-5 text-sm text-zinc-500">Aucune fiche concernée ce mois-ci.</p>;
  return (
    <form action={action} className="carte space-y-3 p-5 text-sm">
      <p className="font-medium">{fiches.length} fiche(s) concernée(s)</p>
      <ul className="max-h-96 space-y-1 overflow-y-auto">
        {fiches.map((f) => (
          <li key={f.id}><label className="flex items-center gap-2"><input type="checkbox" name="ids" value={f.id} defaultChecked className="accent-marque-600" />{f.libelle} — dernier contact {new Date(f.dernier).toLocaleDateString("fr-FR")}</label></li>
        ))}
      </ul>
      <p>Pour confirmer l&apos;effacement définitif des fiches cochées, saisissez <b>SUPPRIMER</b> :</p>
      <input name="confirmation" className="champ w-40" />
      <button disabled={enCours} className="bouton-secondaire text-red-700">{enCours ? "Effacement…" : "Effacer la sélection"}</button>
      {etat.erreur && <p className="text-red-700">{etat.erreur}</p>}
    </form>
  );
}
