"use client";

import { useState } from "react";
import type { FichierAEffacer } from "@/lib/rgpd/effacement";
import ListeFichiers from "@/app/(app)/parametres/rgpd/liste-fichiers";

/** Droits RGPD d'une personne : export (droit d'accès) et effacement. Réservé aux administrateurs. */
export default function BlocRGPD({ id, trigramme }: { id: string; trigramme: string }) {
  const [confirmation, setConfirmation] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fichiers, setFichiers] = useState<FichierAEffacer[] | null>(null);

  async function effacer(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    try {
      const r = await fetch(`/api/consultants/${id}/effacer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation }) });
      const d = (await r.json()) as { fichiers?: FichierAEffacer[]; erreur?: string };
      if (!r.ok || !d.fichiers) setErreur(d.erreur ?? "Effacement impossible.");
      else setFichiers(d.fichiers);
    } catch {
      setErreur("Effacement impossible : vérifiez la connexion et réessayez.");
    } finally {
      setEnCours(false);
    }
  }

  if (fichiers) {
    return (
      <div className="carte space-y-3 p-5 text-sm">
        <p className="font-semibold text-emerald-700">Fiche effacée.</p>
        <ListeFichiers fichiers={fichiers} />
        {/* Rechargement complet (pas de navigation interne) : la liste gardée en mémoire dans le navigateur repart sans la fiche effacée. */}
        {/* eslint-disable-next-line @next/next/no-location-assign-relative-destination */}
        <button type="button" onClick={() => window.location.assign("/consultants")} className="bouton-primaire">Retour à la liste des consultants</button>
      </div>
    );
  }
  return (
    <div className="carte space-y-3 p-5 text-sm">
      <h2 className="font-semibold">Données personnelles (RGPD)</h2>
      <a href={`/consultants/${id}/export`} className="bouton-secondaire">Exporter toutes ses données</a>
      <form onSubmit={effacer} className="space-y-2">
        <p className="text-zinc-600">
          Effacer définitivement cette personne de l&apos;outil.{" "}
          {trigramme ? <>Saisissez son trigramme <b>{trigramme}</b> pour confirmer.</> : <>Elle n&apos;a pas de trigramme : laissez la case vide pour confirmer.</>}
        </p>
        <input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className="champ w-32" />
        <button disabled={enCours} className="bouton-secondaire text-red-700">{enCours ? "Effacement…" : "Effacer définitivement"}</button>
        {erreur && <p className="text-red-700">{erreur}</p>}
      </form>
    </div>
  );
}
