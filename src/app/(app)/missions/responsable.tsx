"use client";

import { useState, useTransition } from "react";
import { assignerMission } from "@/lib/missions/actions";
import type { Responsable } from "@/lib/missions/responsables";

/** Responsable d'une mission : liste de choix enregistrée dès la sélection (administrateur), simple mention pour les autres. */
export default function ChoixResponsable({ missionId, responsableId, responsables, estAdmin }: {
  missionId: string; responsableId: string | null; responsables: Responsable[]; estAdmin: boolean; compact?: boolean;
}) {
  const [valeur, setValeur] = useState(responsableId ?? "");
  const [etat, setEtat] = useState<"" | "ok" | "erreur">("");
  const [enCours, demarrer] = useTransition();
  const nom = responsables.find((r) => r.id === valeur)?.nom;
  if (!estAdmin) {
    return nom
      ? <span className="pastille bg-marque-50/90 text-marque-700 ring-marque-100">{nom}</span>
      : <span className="pastille pastille-orange">À assigner</span>;
  }
  function choisir(id: string) {
    const avant = valeur;
    setValeur(id);
    setEtat("");
    demarrer(async () => {
      const f = new FormData();
      f.set("mission_id", missionId);
      f.set("responsable_id", id);
      try { await assignerMission(f); setEtat("ok"); } catch { setValeur(avant); setEtat("erreur"); }
    });
  }
  return (
    <span className="inline-flex items-center gap-2">
      <select value={valeur} onChange={(e) => choisir(e.target.value)} disabled={enCours} aria-label="Responsable de la mission"
        className={`champ py-1.5 pr-8 text-xs font-semibold ${valeur ? "text-nuit" : "text-amber-700"}`}>
        <option value="">À assigner</option>
        {responsables.map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}
      </select>
      <span className="text-xs empty:hidden" aria-live="polite">
        {enCours ? <span className="text-slate-400">Enregistrement…</span>
          : etat === "ok" ? <span className="font-medium text-emerald-600">Enregistré ✓</span>
          : etat === "erreur" ? <span className="text-red-700">Échec</span> : null}
      </span>
    </span>
  );
}
