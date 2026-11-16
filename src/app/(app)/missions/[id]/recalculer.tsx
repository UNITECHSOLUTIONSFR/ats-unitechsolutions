"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { recalculerMission } from "@/lib/missions/actions";

/** Recalcul du classement à la demande : fait en arrière-plan, l'écran se met à jour tout seul une fois fini. */
export default function BoutonRecalculer({ missionId }: { missionId: string }) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [demande, setDemande] = useState(false);
  return (
    <button type="button" disabled={enCours || demande} className="lien text-xs disabled:opacity-60"
      onClick={() => demarrer(async () => {
        await recalculerMission(missionId);
        setDemande(true);
        // Le calcul prend en général 5 à 20 secondes : l'écran est relu ensuite.
        for (const attente of [8_000, 12_000, 20_000]) setTimeout(() => router.refresh(), attente);
        setTimeout(() => setDemande(false), 20_000);
      })}>
      {demande ? "Recalcul lancé…" : "Recalculer"}
    </button>
  );
}
