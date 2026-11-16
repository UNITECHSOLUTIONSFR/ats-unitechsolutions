"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { lancerTache, type EtatTache } from "@/lib/sync/actions";
import { AttenteVoile } from "../attente";

/** Colonne Trello de la mission (« À répartir » pour « Missions en cours », sinon le recruteur ou l'étape), avec le lien vers la carte. */
export function EtiquetteTrello({ colonne, recruteur, url, compacte }: { colonne: string | null; recruteur: string | null; url: string | null; compacte?: boolean }) {
  const aRepartir = !!colonne && /missions? en cours/i.test(colonne);
  const texte = recruteur ? `Sourcing ${recruteur}` : aRepartir ? "À répartir" : colonne ?? "Trello";
  const classe = `inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ring-1 ${aRepartir ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-sky-50 text-sky-800 ring-sky-200"}`;
  const contenu = <><span aria-hidden className="text-xs">▦</span>{texte}{!compacte && url && <span className="text-xs font-normal opacity-70">· voir dans Trello ↗</span>}</>;
  return url ? <a href={url} target="_blank" rel="noreferrer" className={classe} title="Ouvrir la carte dans Trello">{contenu}</a> : <span className={classe}>{contenu}</span>;
}

/** Bouton « Actualiser depuis Trello » (administrateurs) : relit le tableau tout de suite au lieu d'attendre l'heure suivante. */
export function BoutonActualiserTrello({ derniereLecture }: { derniereLecture: string | null }) {
  const [etat, action, enCours] = useActionState<EtatTache, FormData>(lancerTache, {});
  const router = useRouter();
  useEffect(() => { if (etat.message) router.refresh(); }, [etat.message, router]);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <AttenteVoile actif={enCours} messages={["Je lis le tableau Trello…", "Je mets les missions à jour…", "L'IA lit les nouvelles fiches de poste…"]} sousTitre="Jusqu'à une minute s'il y a de nouvelles missions." />
      <input type="hidden" name="tache" value="trello" />
      <span className="text-xs text-slate-500">
        {enCours ? "Lecture du tableau Trello…" : etat.erreur ? <span className="text-red-700">{etat.erreur}</span> : etat.message ? <span className="text-emerald-700">Missions à jour ✓</span>
          : derniereLecture ? `Trello lu le ${new Date(derniereLecture).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}` : "Trello pas encore lu"}
      </span>
      <button disabled={enCours} className="bouton-secondaire">
        <svg viewBox="0 0 20 20" fill="currentColor" className={`h-4 w-4 ${enCours ? "animate-spin" : ""}`} aria-hidden><path fillRule="evenodd" d="M15.31 4.69a7 7 0 00-11.03 1.5.75.75 0 101.3.75 5.5 5.5 0 019.12-1.18l-1.45 1.45a.5.5 0 00.35.85H17a.5.5 0 00.5-.5V4.15a.5.5 0 00-.85-.35l-1.34 1.34zM4.69 15.31a7 7 0 0011.03-1.5.75.75 0 10-1.3-.75 5.5 5.5 0 01-9.12 1.18l1.45-1.45a.5.5 0 00-.35-.85H3a.5.5 0 00-.5.5v3.41a.5.5 0 00.85.35l1.34-1.34z" clipRule="evenodd" /></svg>
        {enCours ? "Actualisation…" : "Actualiser depuis Trello"}
      </button>
    </form>
  );
}
