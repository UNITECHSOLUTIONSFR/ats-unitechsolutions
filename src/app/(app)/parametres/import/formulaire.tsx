"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { traiterFichierExcel, type EtatImport } from "@/lib/import/actions";

export default function FormulaireImport() {
  const [etat, action, enCours] = useActionState<EtatImport, FormData>(traiterFichierExcel, { etape: "depart" });
  const fichier = useRef<File | null>(null);
  const [nom, setNom] = useState<string | null>(null);
  const [aAjouter, setAAjouter] = useState<string[]>([]);

  function envoyer(confirmer: boolean) {
    if (!fichier.current) return;
    const fd = new FormData();
    fd.set("fichier", fichier.current);
    fd.set("confirmer", confirmer ? "oui" : "non");
    for (const c of aAjouter) fd.append("ajouter", c);
    startTransition(() => action(fd));
  }

  const p = etat.prevision;
  const reconnues = (etat.colonnes ?? []).filter((c) => c.cible);
  const nouvelles = (etat.colonnes ?? []).filter((c) => c.type === "nouvelle");
  const basculer = (c: string) => setAAjouter((l) => (l.includes(c) ? l.filter((x) => x !== c) : [...l, c]));

  return (
    <div className="space-y-4">
      <div className="carte flex flex-wrap items-center gap-3 p-5">
        <input
          type="file"
          accept=".xlsx"
          onChange={(e) => { fichier.current = e.target.files?.[0] ?? null; setNom(fichier.current?.name ?? null); setAAjouter([]); }}
          className="w-full min-w-0 text-sm sm:w-auto"
        />
        <button type="button" disabled={!nom || enCours} onClick={() => envoyer(false)} className="bouton-primaire">
          {enCours && etat.etape !== "apercu" ? "Analyse…" : "1. Analyser le fichier"}
        </button>
      </div>

      {etat.etape === "erreur" && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{etat.message}</p>}

      {etat.etape === "apercu" && p && (
        <div className="carte space-y-5 p-5 text-sm">
          <h2 className="titre-section">Ce qui va être ajouté — {etat.nomFichier}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Chiffre valeur={p.nouvelles} libelle="nouveaux consultants" />
            <Chiffre valeur={p.completees} libelle="déjà en base : cases vides complétées" />
            <Chiffre valeur={p.lignesLues} libelle="lignes lues" />
          </div>
          <p className="text-slate-600">
            Rien n&apos;est écrasé ni supprimé : une case déjà remplie dans la base garde sa valeur.
            Les nouveaux consultants seront ajoutés au fichier Excel de suivi lors de la synchronisation de nuit.
          </p>

          <div>
            <h3 className="mb-2 font-semibold">Colonnes reprises ({reconnues.length})</h3>
            <ul className="flex flex-wrap gap-1.5">
              {reconnues.map((c) => (
                <li key={c.colonne} className="pastille bg-slate-50 text-slate-700 ring-slate-200">
                  {c.colonne === c.cible ? c.colonne : <>{c.colonne} → {c.cible}</>}
                </li>
              ))}
            </ul>
          </div>

          {nouvelles.length > 0 && (
            <div>
              <h3 className="mb-1 font-semibold">Colonnes absentes de la base ({nouvelles.length})</h3>
              <p className="mb-2 text-slate-600">Ignorées, sauf celles que vous cochez : elles seront ajoutées en fin de tableau (et dans le fichier Excel de suivi).</p>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {nouvelles.map((c) => (
                  <li key={c.colonne}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                      <input type="checkbox" checked={aAjouter.includes(c.colonne)} onChange={() => basculer(c.colonne)} className="h-4 w-4 accent-marque-600" />
                      <span>Ajouter la colonne <b>{c.colonne}</b></span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(p.doublonsPossibles > 0 || p.sansNom > 0 || p.telephonesInvalides.length > 0 || p.emailsInvalides.length > 0) && (
            <div className="space-y-1 text-slate-600">
              <h3 className="font-semibold text-slate-800">À vérifier après l&apos;import (alertes créées)</h3>
              {p.doublonsPossibles > 0 && <p>Doublons possibles (même nom, coordonnées différentes) : <b>{p.doublonsPossibles}</b></p>}
              {p.sansNom > 0 && <p>Lignes sans nom : <b>{p.sansNom}</b></p>}
              <Detail titre="Téléphones non reconnus (gardés tels quels)" lignes={p.telephonesInvalides} />
              <Detail titre="Emails invalides (ignorés)" lignes={p.emailsInvalides} />
            </div>
          )}

          <button type="button" disabled={enCours} onClick={() => envoyer(true)} className="bouton-primaire">
            {enCours ? "Ajout en cours…" : `2. Ajouter à la base${aAjouter.length ? ` (+ ${aAjouter.length} colonne${aAjouter.length > 1 ? "s" : ""})` : ""}`}
          </button>
        </div>
      )}

      {etat.etape === "termine" && etat.bilan && (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          Import terminé : {etat.bilan.crees} consultant(s) ajouté(s), {etat.bilan.completees} fiche(s) complétée(s)
          {etat.bilan.colonnesAjoutees.length > 0 && `, colonne(s) ajoutée(s) : ${etat.bilan.colonnesAjoutees.join(", ")}`}
          {etat.bilan.alertes > 0 && `, ${etat.bilan.alertes} cas à vérifier dans Alertes`}.
          {etat.bilan.erreurs.length > 0 && ` ${etat.bilan.erreurs.length} erreur(s) : ${etat.bilan.erreurs.slice(0, 3).join(" ; ")}`}
        </p>
      )}
    </div>
  );
}

function Chiffre({ valeur, libelle }: { valeur: number; libelle: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
      <div className="text-2xl font-extrabold tabular-nums text-marque-700">{valeur}</div>
      <div className="text-xs text-slate-600">{libelle}</div>
    </div>
  );
}

function Detail({ titre, lignes }: { titre: string; lignes: string[] }) {
  if (!lignes.length) return null;
  return (
    <details>
      <summary className="cursor-pointer">{titre} ({lignes.length})</summary>
      <ul className="mt-1 max-h-48 overflow-y-auto text-xs">
        {lignes.map((l) => <li key={l}>{l}</li>)}
      </ul>
    </details>
  );
}
