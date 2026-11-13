"use client";

import { useEffect, useState } from "react";
import type { DonneesTableau } from "@/lib/tableau/chargement";
import TableauExcel from "./tableau-excel";

// Données de l'écran Consultants gardées dans le navigateur : préchargées dès l'ouverture de l'application,
// elles s'affichent instantanément au clic, puis sont rafraîchies en arrière-plan.
let memoire: DonneesTableau | null = null;
let enCours: Promise<DonneesTableau> | null = null;

/** Vues de l'écran Consultants : toute la base, ou les arrivées du jour (email, SharePoint). Les métiers se filtrent par la colonne « Domaine ». */
const VUES = [{ cle: "", nom: "Toute la base" }, { cle: "email_jour", nom: "Reçus par email aujourd'hui" }, { cle: "sharepoint_jour", nom: "Ajoutés depuis SharePoint aujourd'hui" }];

export function chargerTableauNavigateur(): Promise<DonneesTableau> {
  enCours ??= fetch("/api/consultants/tableau", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<DonneesTableau>) : Promise.reject(new Error(String(r.status)))))
    .then((d) => { memoire = d; return d; })
    .finally(() => { enCours = null; });
  return enCours;
}

/** Précharge le tableau en arrière-plan (appelé une fois, au démarrage de l'application). */
export function PrechargementConsultants() {
  useEffect(() => {
    const t = setTimeout(() => { if (!memoire) chargerTableauNavigateur().catch(() => undefined); }, 300);
    return () => clearTimeout(t);
  }, []);
  return null;
}

/** Écran Consultants : données en mémoire si possible, sinon les 100 premières lignes tout de suite, puis le reste. */
export default function ChargeurTableau({ apercu, vueInitiale, colonneDomaine, estAdmin }: {
  apercu: DonneesTableau; vueInitiale: string; colonneDomaine: string; estAdmin: boolean;
}) {
  const [donnees, setDonnees] = useState<DonneesTableau>(memoire ?? apercu);
  const [complet, setComplet] = useState(!!memoire);
  const [erreur, setErreur] = useState(false);
  useEffect(() => {
    let actif = true;
    chargerTableauNavigateur()
      .then((d) => { if (actif) { setDonnees(d); setComplet(true); } })
      .catch(() => { if (actif) setErreur(true); });
    return () => { actif = false; };
  }, []);

  return (
    <>
      {erreur && !complet && <p className="mb-2 text-sm text-red-700">Les autres lignes n&apos;ont pas pu être chargées. Rechargez la page.</p>}
      <TableauExcel
        vues={VUES}
        vueInitiale={vueInitiale}
        colonneDomaine={colonneDomaine}
        ongletId={donnees.ongletId}
        entetes={donnees.entetes}
        champs={donnees.champs}
        lignes={donnees.lignes}
        estAdmin={estAdmin}
        documents={donnees.documents}
        chargementPartiel={!complet}
      />
    </>
  );
}
