"use client";

import { useRef, useState } from "react";
import { lancerRepriseDossier, type EtatReprise } from "@/lib/emails/actions";

/**
 * Reprise d'un dossier de boîte mail (une seule fois) : l'écran enchaîne les passages de 12 emails jusqu'à la fin.
 * Les CV restent sur la plateforme (pas de dépôt SharePoint). Accès Exchange temporaire requis sur la boîte.
 */
export default function RepriseDossier({ boiteParDefaut }: { boiteParDefaut: string }) {
  const [enCours, setEnCours] = useState(false);
  const [dernier, setDernier] = useState<EtatReprise>({});
  const [cumul, setCumul] = useState({ lus: 0, candidatures: 0, cout: 0 });
  const arret = useRef(false);

  const lancer = async (fd: FormData) => {
    arret.current = false;
    setEnCours(true);
    try {
      for (;;) {
        const r = await lancerRepriseDossier({}, fd);
        setDernier(r);
        if (!r.message) break; // erreur bloquante
        setCumul((c) => ({ lus: c.lus + Number(/^(\d+)/.exec(r.message ?? "")?.[1] ?? 0), candidatures: c.candidatures + (r.candidatures ?? 0), cout: c.cout + (r.cout ?? 0) }));
        if (!r.restants || arret.current) break;
      }
    } catch {
      setDernier({ erreur: "Connexion interrompue : relancez, la reprise continue là où elle s'est arrêtée." });
    } finally {
      setEnCours(false);
    }
  };

  return (
    <form action={lancer} className="carte space-y-3 p-5 text-sm">
      <div>
        <h2 className="titre-section">Reprise d&apos;un dossier de boîte mail</h2>
        <p className="mt-0.5 text-slate-500">
          Une seule fois, après l&apos;ouverture de l&apos;accès temporaire à la boîte. Tous les sous-dossiers sont inclus. Chaque CV joint crée
          ou complète une fiche ; les fichiers ne sont <b>pas</b> déposés dans SharePoint (le Word Unitech les y rangera). Gardez cette page ouverte.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
        <label className="block"><span className="text-slate-600">Boîte</span><input name="boite" defaultValue={boiteParDefaut} className="champ mt-1 w-full" /></label>
        <label className="block"><span className="text-slate-600">Dossier (dans la boîte de réception)</span><input name="dossier" defaultValue="Consultant" className="champ mt-1 w-full" /></label>
        {enCours
          ? <button type="button" onClick={() => { arret.current = true; }} className="bouton-secondaire justify-center">En cours… arrêter après ce passage</button>
          : <button className="bouton-primaire justify-center">Lancer la reprise</button>}
      </div>
      {(cumul.lus > 0 || dernier.erreur) && (
        <div className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
          <p className="font-semibold text-nuit">
            {cumul.lus} email(s) traités · {cumul.candidatures} candidature(s) · {cumul.cout.toFixed(2)} $
            {dernier.total !== undefined && <> · reste {dernier.restants ?? 0} sur {dernier.total}</>}
            {!enCours && cumul.lus > 0 && !dernier.restants && " · terminé ✓"}
          </p>
          {dernier.message && <p className="text-slate-500">Dernier passage : {dernier.message}</p>}
          {dernier.erreur && <p className="text-red-700">{dernier.erreur}</p>}
        </div>
      )}
    </form>
  );
}
