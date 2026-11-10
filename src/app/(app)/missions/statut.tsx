"use client";

import { useState, useTransition } from "react";
import { changerStatutMission } from "@/lib/missions/actions";

/** Statut d'une mission : enregistré dès la sélection, avec confirmation visible. */
export default function ChoixStatut({ missionId, statut }: { missionId: string; statut: string }) {
  const [valeur, setValeur] = useState(statut);
  const [etat, setEtat] = useState<"" | "ok" | "erreur">("");
  const [enCours, demarrer] = useTransition();
  function choisir(s: string) {
    const avant = valeur;
    setValeur(s); setEtat("");
    demarrer(async () => {
      const f = new FormData();
      f.set("mission_id", missionId); f.set("statut", s);
      try { await changerStatutMission(f); setEtat("ok"); } catch { setValeur(avant); setEtat("erreur"); }
    });
  }
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span className="text-slate-500">Statut</span>
      <select value={valeur} onChange={(e) => choisir(e.target.value)} disabled={enCours} aria-label="Statut de la mission" className="champ py-1.5">
        <option value="ouverte">Ouverte</option><option value="pourvue">Pourvue</option><option value="fermee">Fermée</option>
      </select>
      <span className="w-24 text-xs" aria-live="polite">
        {enCours ? <span className="text-slate-400">Enregistrement…</span> : etat === "ok" ? <span className="font-medium text-emerald-600">Enregistré ✓</span> : etat === "erreur" ? <span className="text-red-700">Échec</span> : null}
      </span>
    </span>
  );
}
