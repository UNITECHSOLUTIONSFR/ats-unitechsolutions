"use client";

import { useEffect, useState } from "react";
import type { DonneesTableau } from "@/lib/tableau/chargement";
import TableauExcel from "./tableau-excel";

// Dernières données reçues : réaffichées immédiatement à la prochaine ouverture de l'écran, puis rafraîchies.
let memoire: DonneesTableau | null = null;

export default function ChargeurTableau({ vueInitiale, colonneDomaine, estAdmin }: { vueInitiale: string; colonneDomaine: string; estAdmin: boolean }) {
  const [donnees, setDonnees] = useState<DonneesTableau | null>(memoire);
  const [erreur, setErreur] = useState(false);
  useEffect(() => {
    let actif = true;
    fetch("/api/consultants/tableau", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<DonneesTableau>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => { memoire = d; if (actif) setDonnees(d); })
      .catch(() => { if (actif) setErreur(true); });
    return () => { actif = false; };
  }, []);

  if (!donnees) {
    return (
      <div className="space-y-4" aria-busy="true">
        <h1 className="titre-page">Consultants</h1>
        {erreur ? <p className="text-sm text-red-700">Le tableau n&apos;a pas pu être chargé. Rechargez la page.</p> : (
          <>
            <div className="squelette h-10 w-full max-w-xl" />
            <div className="carte space-y-2 p-4">{Array.from({ length: 12 }, (_, i) => <div key={i} className="squelette h-8" />)}</div>
          </>
        )}
      </div>
    );
  }
  return (
    <TableauExcel
      vues={[{ cle: "", nom: "Tous" }, ...donnees.domaines.map((d) => ({ cle: d, nom: d }))]}
      vueInitiale={vueInitiale}
      colonneDomaine={colonneDomaine}
      ongletId={donnees.ongletId}
      entetes={donnees.entetes}
      champs={donnees.champs}
      lignes={donnees.lignes}
      estAdmin={estAdmin}
      documents={donnees.documents}
    />
  );
}
