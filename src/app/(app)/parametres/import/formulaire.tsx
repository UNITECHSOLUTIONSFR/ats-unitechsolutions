"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { traiterFichierExcel, type EtatImport } from "@/lib/import/actions";

const CHAMPS: Record<string, string> = {
  prenom: "Prénom", nom: "Nom", nom_complet: "Nom complet", email: "Email", telephone: "Téléphone",
  trigramme: "Trigramme", disponibilite: "Disponibilité", intitule_poste: "Intitulé de poste",
  localisation: "Localisation", notes: "Notes", statut: "Statut", date_maj: "Date de mise à jour", email_2: "Email 2", commentaire_email: "Commentaire email", experience: "Expérience", tjm_salaire: "TJM / Salaire", linkedin: "LinkedIn", cv_lien: "CV",
};

export default function FormulaireImport() {
  const [etat, action, enCours] = useActionState<EtatImport, FormData>(traiterFichierExcel, { etape: "depart" });
  const fichier = useRef<File | null>(null);
  const [nom, setNom] = useState<string | null>(null);

  function envoyer(confirmer: boolean) {
    if (!fichier.current) return;
    const fd = new FormData();
    fd.set("fichier", fichier.current);
    fd.set("confirmer", confirmer ? "oui" : "non");
    startTransition(() => action(fd));
  }

  const r = etat.rapport;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 carte p-5">
        <input
          type="file"
          accept=".xlsx"
          onChange={(e) => { fichier.current = e.target.files?.[0] ?? null; setNom(fichier.current?.name ?? null); }}
          className="text-sm"
        />
        <button type="button" disabled={!nom || enCours} onClick={() => envoyer(false)}
          className="bouton-primaire">
          {enCours ? "Analyse…" : "1. Analyser le fichier"}
        </button>
      </div>

      {etat.etape === "erreur" && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{etat.message}</p>}

      {r && (
        <div className="space-y-3 carte p-5 text-sm">
          <h2 className="font-semibold">Rapport — {etat.nomFichier}</h2>
          {etat.colonnes && (
            <p className="text-zinc-600">
              Colonnes reconnues : {etat.colonnes.map((c) => `${c.colonne} → ${CHAMPS[c.champ] ?? c.champ}`).join(" · ")}
              {r.colonnesNonReconnues.length > 0 && <> — ignorées : {r.colonnesNonReconnues.join(", ")}</>}
            </p>
          )}
          {etat.onglets && (
            <p className="text-zinc-600">
              Onglets recopiés à l&apos;identique dans le tableau de suivi : {etat.onglets.map((o) => `${o.nom} (${o.lignes} lignes, ${o.colonnes} colonnes)`).join(" · ")}.
              Les fiches consultants sont créées à partir du 1er onglet. <b>Le tableau de suivi actuel est remplacé.</b>
            </p>
          )}
          <ul className="grid gap-1 sm:grid-cols-2">
            <li>Lignes lues : <b>{r.lignesLues}</b></li>
            <li>Fiches à créer ou compléter : <b>{r.fichesRetenues}</b></li>
            <li>Doublons fusionnés dans le fichier : <b>{r.doublonsFusionnes.length}</b></li>
            <li>Doublons possibles (même nom) : <b>{r.doublonsPossibles.length}</b></li>
            <li>Téléphones corrigés (zéro ajouté…) : <b>{r.telephonesCorriges.length}</b></li>
            <li>Téléphones non reconnus (gardés tels quels) : <b>{r.telephonesInvalides.length}</b></li>
            <li>Emails restant invalides (après correction) : <b>{r.emailsInvalides.length}</b></li>
            <li>Lignes sans nom (importées, avec alerte) : <b>{r.rejets.length}</b></li>
            <li>Trigrammes différents de la règle : <b>{r.trigrammesDifferents.length}</b> (on garde celui de l&apos;Excel)</li>
          </ul>
          <Detail titre="Lignes sans nom (importées, avec alerte)" lignes={r.rejets.map((x) => `Ligne ${x.ligne} : ${x.raison} — ${Object.entries(x.valeurs).map(([k, v]) => `${k}: ${v}`).join(" · ") || "ligne vide"}`)} />
          <Detail titre="Téléphones non reconnus" lignes={r.telephonesInvalides.map((x) => `Ligne ${x.ligne} : ${x.valeur}`)} />
          <Detail titre="Emails invalides" lignes={r.emailsInvalides.map((x) => `Ligne ${x.ligne} : ${x.valeur}`)} />
          <Detail titre="Doublons possibles" lignes={r.doublonsPossibles.map((x) => `Lignes ${x.lignes.join(", ")} : ${x.nom}`)} />
          <Detail titre="Trigrammes différents" lignes={r.trigrammesDifferents.map((x) => `Ligne ${x.ligne} : ${x.excel} (règle : ${x.calcule})`)} />

          {etat.etape === "apercu" && (
            <button type="button" disabled={enCours} onClick={() => envoyer(true)}
              className="rounded-lg bg-marque-600 px-4 py-2 font-medium text-white disabled:opacity-50">
              {enCours ? "Import en cours…" : `2. Importer ${r.fichesRetenues} fiches`}
            </button>
          )}
        </div>
      )}

      {etat.etape === "termine" && etat.bilan && (
        <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
          Import terminé : {etat.bilan.crees} fiches créées, {etat.bilan.misAJour} complétées, {etat.bilan.alertes} cas à vérifier.
          {etat.bilanTableau && ` Tableau de suivi : ${etat.bilanTableau.onglets} onglet(s), ${etat.bilanTableau.lignes} lignes (${etat.bilanTableau.lignesReliees} reliées à une fiche).`}
          {etat.bilan.erreurs.length > 0 && ` ${etat.bilan.erreurs.length} erreur(s) : ${etat.bilan.erreurs.slice(0, 3).join(" ; ")}`}
          {(etat.bilanTableau?.erreurs.length ?? 0) > 0 && ` Tableau : ${etat.bilanTableau!.erreurs.slice(0, 3).join(" ; ")}`}
        </p>
      )}
    </div>
  );
}

function Detail({ titre, lignes }: { titre: string; lignes: string[] }) {
  if (!lignes.length) return null;
  return (
    <details>
      <summary className="cursor-pointer text-zinc-600">{titre} ({lignes.length})</summary>
      <ul className="mt-1 max-h-48 overflow-y-auto text-xs text-zinc-600">
        {lignes.map((l) => <li key={l}>{l}</li>)}
      </ul>
    </details>
  );
}
