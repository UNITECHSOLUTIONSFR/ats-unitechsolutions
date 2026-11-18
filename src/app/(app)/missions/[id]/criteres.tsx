"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { enregistrerCriteres } from "@/lib/missions/actions";

interface Criteres { metier: { libelle: string; synonymes: string[] }; obligatoires: { critere: string; synonymes: string[] }[]; souhaites: string[] }

function Bouton({ libelle }: { libelle: string }) {
  const { pending } = useFormStatus();
  return <button disabled={pending} className="bouton-primaire">{pending ? "Enregistrement…" : libelle}</button>;
}

/**
 * Matching v2 : ce qui décide de la mission. Un profil n'est proposé que si son CV contient le métier ET chaque critère
 * obligatoire (ou un de leurs synonymes). Lus par l'IA dans la mission ; l'équipe peut les corriger.
 */
export default function CriteresMatching({ missionId, criteres, parEquipe, eligibles }: { missionId: string; criteres: Criteres | null; parEquipe: boolean; eligibles: number | null | undefined }) {
  const [edition, setEdition] = useState(false);
  if (!criteres) {
    return <div className="carte p-5 text-sm text-slate-500">Critères de la mission en cours de lecture par l&apos;IA : ils apparaîtront après le prochain calcul du classement.</div>;
  }
  const texte = [`${criteres.metier.libelle} = ${criteres.metier.synonymes.join(", ")}`, ...criteres.obligatoires.map((o) => `${o.critere} = ${o.synonymes.join(", ")}`)].join("\n");
  return (
    <div className="carte space-y-3 p-5 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="titre-section">Ce qui décide de cette mission</h2>
        <span className="text-xs text-slate-500">{parEquipe ? "Corrigé par l'équipe" : "Lu par l'IA dans la mission"}{eligibles != null && ` · ${eligibles} profil(s) de la base remplissent tout`}</span>
      </div>
      <p className="text-slate-500">Un profil n&apos;est proposé que si son CV contient <b>le métier et chaque critère obligatoire</b> (ou un de leurs synonymes). L&apos;IA lit ensuite le CV complet des 30 premiers et les note.</p>
      <div className="flex flex-wrap gap-2">
        <span className="pastille" title={criteres.metier.synonymes.join(", ")}>Métier : <b className="ml-1">{criteres.metier.libelle}</b></span>
        {criteres.obligatoires.map((o) => (
          <span key={o.critere} className="pastille pastille-orange" title={o.synonymes.join(", ")}>Obligatoire : <b className="ml-1">{o.critere}</b></span>
        ))}
        {!criteres.obligatoires.length && <span className="text-xs text-slate-500">Aucun critère obligatoire au-delà du métier.</span>}
      </div>
      {!edition ? (
        <button type="button" onClick={() => setEdition(true)} className="lien text-xs">Corriger les critères</button>
      ) : (
        <form action={enregistrerCriteres} className="space-y-2">
          <input type="hidden" name="mission_id" value={missionId} />
          <label className="block text-xs text-slate-500">
            1re ligne : le métier ; lignes suivantes : les critères obligatoires (3 au plus). Format : <code>libellé = synonyme, synonyme</code>. Tout effacer = revenir aux critères de l&apos;IA.
            <textarea name="criteres" defaultValue={texte} rows={4} className="champ mt-1 w-full font-mono text-xs" />
          </label>
          <div className="flex gap-2">
            <Bouton libelle="Enregistrer et recalculer" />
            <button type="button" onClick={() => setEdition(false)} className="bouton-secondaire">Annuler</button>
          </div>
        </form>
      )}
    </div>
  );
}
