"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ajouterNote } from "@/lib/consultants/actions";

export interface NoteEquipe { id: string; texte: string; date: string; auteur: string }

/**
 * Notes de l'équipe sur la fiche : chacun ajoute sa note, datée et signée ; rien n'est écrasé.
 * Les plus récentes en haut (ex. « 10/11 · Anaelle : appelé, dispo mars » puis « 12/11 · Amadou : envoyé au client »).
 */
export default function NotesEquipe({ consultantId, notes }: { consultantId: string; notes: NoteEquipe[] }) {
  const router = useRouter();
  const [envoi, demarrer] = useTransition();
  const formulaire = useRef<HTMLFormElement>(null);
  return (
    <section className="carte space-y-3 p-6 text-sm">
      <h2 className="titre-section">Notes de l&apos;équipe</h2>
      <form ref={formulaire} action={(f) => demarrer(async () => { await ajouterNote(f); formulaire.current?.reset(); router.refresh(); })} className="space-y-2">
        <input type="hidden" name="consultant_id" value={consultantId} />
        <textarea name="texte" required maxLength={2000} rows={2} placeholder="Ajouter une note (ex. appelé, dispo début mars, intéressé par la mission X)" className="champ w-full" />
        <button disabled={envoi} className="bouton-primaire">{envoi ? "Ajout…" : "Ajouter la note"}</button>
      </form>
      {notes.length ? (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200/70">
              <div className="text-xs text-slate-500"><b className="font-semibold text-nuit">{n.auteur}</b> · {new Date(n.date).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" })}</div>
              <div className="whitespace-pre-line text-slate-800">{n.texte}</div>
            </li>
          ))}
        </ul>
      ) : <p className="text-slate-500">Aucune note pour l&apos;instant.</p>}
    </section>
  );
}
