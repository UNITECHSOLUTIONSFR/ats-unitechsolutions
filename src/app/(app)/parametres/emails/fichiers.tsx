"use client";

import { useState } from "react";
import { recupererFichiersCV, type EtatFichiers } from "@/lib/emails/actions";
import { AttenteVoile } from "../../attente";

/** Récupération des fichiers des CV déjà analysés (historique recrutement@, dossier « Consultant ») : enchaîne les passages jusqu'à la fin. */
export default function RecuperationFichiers() {
  const [enCours, setEnCours] = useState<string | null>(null);
  const [etat, setEtat] = useState<Record<string, { ranges: number; dernier: EtatFichiers }>>({});
  const lancer = async (source: "groupe" | "perso") => {
    setEnCours(source);
    setEtat((e) => ({ ...e, [source]: { ranges: 0, dernier: {} } }));
    try {
      for (let i = 0; i < 60; i++) {
        const fd = new FormData();
        fd.set("source", source);
        const r = await recupererFichiersCV({}, fd);
        setEtat((e) => ({ ...e, [source]: { ranges: (e[source]?.ranges ?? 0) + (r.ranges ?? 0), dernier: r } }));
        if (!r.aSuivre) break;
      }
    } catch {
      setEtat((e) => ({ ...e, [source]: { ranges: e[source]?.ranges ?? 0, dernier: { erreur: "Connexion interrompue : relancez, la récupération reprend là où elle s'est arrêtée." } } }));
    } finally {
      setEnCours(null);
    }
  };
  const ligne = (source: "groupe" | "perso", titre: string, texte: string) => (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
      <div className="min-w-0">
        <div className="font-semibold text-nuit">{titre}</div>
        <div className="text-slate-500">{texte}</div>
        {etat[source] && (
          <div className="mt-1">
            <span className="text-emerald-700">{etat[source].ranges} fichier(s) rangé(s){enCours === source ? "…" : " · terminé"}</span>
            {enCours === source && etat[source].dernier.lecture && <span className="ml-2 text-slate-500">({etat[source].dernier.lecture})</span>}
            {enCours !== source && etat[source].dernier.restants ? <span className="ml-2 text-slate-500">{etat[source].dernier.restants} restant(s)</span> : null}
            {etat[source].dernier.erreur && <span className="ml-2 text-red-700">{etat[source].dernier.erreur}</span>}
          </div>
        )}
      </div>
      <button type="button" disabled={!!enCours} onClick={() => lancer(source)} className="bouton-primaire">Récupérer les fichiers</button>
    </div>
  );
  return (
    <section className="carte space-y-3 p-5 text-sm">
      <AttenteVoile actif={!!enCours} messages={["Je télécharge les CV d'origine…", "Je les range dans SharePoint, « Candidatures reçues »…", "Je relie chaque fichier à sa fiche…"]} sousTitre="Quelques minutes. Gardez cette page ouverte." />
      <div>
        <h2 className="titre-section">Fichiers des CV déjà analysés</h2>
        <p className="mt-0.5 text-slate-500">Une seule fois, accès temporaire ouvert : les CV d&apos;origine (Word, PDF) sont rangés dans SharePoint, « Candidatures reçues », et chaque fiche peut les ouvrir. Aucune IA.</p>
      </div>
      {ligne("groupe", "Historique du groupe recrutement@", "522 CV · plusieurs minutes, gardez la page ouverte")}
      {ligne("perso", "Votre dossier « Consultant »", "469 CV · accès temporaire à votre boîte")}
    </section>
  );
}
